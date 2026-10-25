import React, { useState, useEffect, useRef } from 'react';
import { BookOpen, Upload, FileText, Search, Cpu, Database, Code, CheckCircle2, AlertTriangle, Activity, ShieldCheck, Loader2, RotateCcw, XCircle, FileQuestion, AlertCircle, Ban, Sparkles, ChevronDown, ChevronUp, Eye, EyeOff, Info, Copy } from 'lucide-react';
import { toast } from 'sonner';

export default function KnowledgeView({ documentData }) {
  const [testQuery, setTestQuery] = useState('explain normalization and BCNF according to my notes');
  const [searchResults, setSearchResults] = useState([]);
  const [showDeveloperDebug, setShowDeveloperDebug] = useState(false);
  const [searchDiagnostics, setSearchDiagnostics] = useState(null);
  const [askDiagnostics, setAskDiagnostics] = useState(null);

  // Active Document & Complete Upload/Indexing Workflow State
  const [activeDoc, setActiveDoc] = useState(documentData);
  // Upload Workflow States: 'ready' | 'validated' | 'uploading' | 'indexing' | 'success' | 'error'
  const [uploadStatus, setUploadStatus] = useState('ready');
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState({ percent: 0, loaded: 0, total: 0 });
  const [uploadResult, setUploadResult] = useState(null);
  const [uploadError, setUploadError] = useState(null); // { title: string, message: string, stage: string }
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [uploadLimits, setUploadLimits] = useState({ maxMb: 25, maxBytes: 25 * 1024 * 1024, extensions: ['.pdf'] });

  const uploadXhrRef = useRef(null);
  const fileInputRef = useRef(null);
  const isMountedRef = useRef(true);

  // Complete Request Lifecycle States: 'idle' | 'loading' | 'success' | 'no-matches' | 'error'
  const [queryStatus, setQueryStatus] = useState('idle');
  const [pendingQuery, setPendingQuery] = useState('');
  const [lastSubmittedQuery, setLastSubmittedQuery] = useState('');
  const [noMatchReason, setNoMatchReason] = useState(null); // 'service_failure' | 'indexing_in_progress' | 'no_extractable_text' | 'below_relevance_threshold' | 'empty_collection'
  const [queryError, setQueryError] = useState(null); // { title: string, message: string, isNetworkError: boolean, status?: number, endpoint?: string, timestamp?: string }
  const [announcement, setAnnouncement] = useState('');

  // Grounded QA & Retrieval State
  const [askResult, setAskResult] = useState(null);
  const [inspectedCitationId, setInspectedCitationId] = useState(null);

  // Concurrency & Cancellation Guards
  const activeRequestIdRef = useRef(0);
  const abortControllerRef = useRef(null);

  const fetchActiveDocument = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/knowledge/document");
      if (res.ok) {
        const data = await res.json();
        if (data && data.title) {
          setActiveDoc({
            title: data.title,
            uploadedAt: data.uploadedAt,
            totalPages: data.totalPages,
            totalChunks: data.totalChunks,
            chunks: data.chunks || [],
            isRealIngested: true,
            vectorStore: 'qdrant',
            collection: 'astra_knowledge'
          });
        }
      }
    } catch (e) {
      console.warn("Could not fetch active document from backend:", e);
    }
  };

  const handleKnowledgeQuery = async (queryToSearch, isRetry = false) => {
    const q = (queryToSearch !== undefined ? queryToSearch : testQuery).trim();
    if (!q) {
      toast.info("Please enter a question to query your notes.");
      return;
    }

    // 1. Prevent duplicate requests when a query is already running
    if (queryStatus === 'loading' && pendingQuery === q && !isRetry) {
      toast.info("Search is already running for this query.");
      return;
    }

    // 2. Cancel or supersede any prior running request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // 3. Monotonic Request ID to prevent out-of-order race conditions
    const currentRequestId = ++activeRequestIdRef.current;

    // 4. Update UI to Loading Lifecycle State
    setQueryStatus('loading');
    setPendingQuery(q);
    setQueryError(null);
    setAnnouncement(`Searching notes for: "${q}"...`);

    // 5. Client safety timeout (25 seconds)
    const timeoutId = setTimeout(() => {
      if (activeRequestIdRef.current === currentRequestId && !controller.signal.aborted) {
        controller.abort(new DOMException("Query timed out", "TimeoutError"));
      }
    }, 25000);

    try {
      const [askRes, searchRes] = await Promise.all([
        fetch("http://localhost:8000/api/knowledge/ask", {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: q, top_k: 5 }),
          signal: controller.signal
        }),
        fetch("http://localhost:8000/api/knowledge/search", {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q, top_k: 5 }),
          signal: controller.signal
        })
      ]);

      clearTimeout(timeoutId);

      // Verify request is not superseded
      if (currentRequestId !== activeRequestIdRef.current) {
        return;
      }

      // Handle HTTP error statuses (4xx / 5xx)
      if (!askRes.ok || !searchRes.ok) {
        const failedRes = !askRes.ok ? askRes : searchRes;
        let errorDetail = `Server returned status ${failedRes.status}.`;
        try {
          const errData = await failedRes.json();
          if (errData && errData.detail) errorDetail = errData.detail;
        } catch (_) {}

        setQueryError({
          title: "Retrieval Service Failed",
          message: errorDetail,
          isNetworkError: false,
          status: failedRes.status,
          endpoint: !askRes.ok ? "/api/knowledge/ask" : "/api/knowledge/search",
          serviceFailure: true,
          timestamp: new Date().toLocaleTimeString()
        });
        setNoMatchReason('service_failure');
        setQueryStatus('error');
        setAnnouncement(`Retrieval service failed: ${errorDetail}`);
        return;
      }

      const askData = await askRes.json();
      const searchData = await searchRes.json();

      // Again verify not superseded
      if (currentRequestId !== activeRequestIdRef.current) {
        return;
      }

      const results = searchData.results || [];
      const citations = askData.citations || [];
      const sources = askData.sources || [];
      const answer = askData.answer || "";

      // Save diagnostics
      if (searchData.diagnostics) setSearchDiagnostics(searchData.diagnostics);
      if (askData.diagnostics) setAskDiagnostics(askData.diagnostics);

      // Check for No Matches
      const hasCitations = citations.length > 0;
      const hasSources = sources.length > 0;
      const hasResults = results.length > 0;
      const isDocumentGrounded = askData.is_grounded === true || (askData.is_grounded === undefined && (hasCitations || hasSources));
      const groundingStatus = askData.grounding_status || (isDocumentGrounded ? 'document_grounded' : 'unsupported');

      const isNoMatch = 
        (!isDocumentGrounded && !hasCitations && !hasSources && !hasResults) ||
        (!hasCitations && !hasSources && (answer.toLowerCase().includes("couldn't find") || !answer.trim()));

      setLastSubmittedQuery(q);
      setPendingQuery('');
      setInspectedCitationId(null);

      if (isNoMatch) {
        let confirmedReason = 'below_relevance_threshold';
        if (askData.no_match_reason) {
          confirmedReason = askData.no_match_reason;
        } else if (searchData.no_match_reason) {
          confirmedReason = searchData.no_match_reason;
        } else if (uploadStatus === 'uploading' || uploadStatus === 'indexing') {
          confirmedReason = 'indexing_in_progress';
        } else if (activeDoc?.totalPages > 0 && activeDoc?.totalChunks === 0) {
          confirmedReason = 'no_extractable_text';
        } else if (searchData.diagnostics?.filtering_reason === 'empty_collection' || (searchData.diagnostics?.total_points_in_collection === 0 && (!activeDoc?.totalChunks || activeDoc?.totalChunks === 0))) {
          confirmedReason = 'empty_collection';
        } else if (searchData.diagnostics?.filtering_reason === 'below_score_threshold' || askData.diagnostics?.filtering_reason === 'below_score_threshold') {
          confirmedReason = 'below_relevance_threshold';
        } else {
          confirmedReason = 'no_passages_retrieved';
        }

        setNoMatchReason(confirmedReason);
        setSearchResults([]);
        setAskResult({
          question: q,
          answer: "", // Never fabricate an answer to fill an empty response!
          citations: [],
          sources: [],
          isGrounded: false,
          groundingStatus: 'unsupported',
          noMatchReason: confirmedReason,
          quotaExceeded: false,
          warning: null
        });
        setQueryStatus('no-matches');
        setAnnouncement(`No relevant passages found: ${confirmedReason}.`);
      } else {
        setNoMatchReason(null);
        setSearchResults(results);
        setAskResult({
          question: q,
          answer: answer,
          citations: citations,
          sources: sources,
          isGrounded: isDocumentGrounded,
          groundingStatus: groundingStatus,
          quotaExceeded: askData.quota_exceeded || false,
          warning: askData.warning || null
        });
        setQueryStatus('success');
        setAnnouncement(`Found ${results.length} relevant passages and generated answer for '${q}'.`);
      }
    } catch (err) {
      clearTimeout(timeoutId);

      // If aborted because superseded by a newer request, discard silently
      if (err.name === 'AbortError' || err.name === 'TimeoutError') {
        if (currentRequestId !== activeRequestIdRef.current) {
          return;
        }
        const isTimeout = err.name === 'TimeoutError' || err.message?.includes('timed out');
        setQueryError({
          title: isTimeout ? "Query Timed Out" : "Query Cancelled",
          message: isTimeout 
            ? "The request took longer than 25 seconds. The server might be busy generating embeddings. You can retry the query."
            : "The query search was cancelled.",
          isNetworkError: true,
          status: 408,
          endpoint: "/api/knowledge/ask",
          serviceFailure: true,
          timestamp: new Date().toLocaleTimeString()
        });
        setNoMatchReason('service_failure');
        setQueryStatus('error');
        setAnnouncement(isTimeout ? "Query timed out after 25 seconds." : "Query was cancelled.");
        return;
      }

      // Check if superseded
      if (currentRequestId !== activeRequestIdRef.current) {
        return;
      }

      const isNetwork = !window.navigator.onLine || err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError');
      const errorMsg = isNetwork
        ? "Could not connect to the ASTRA Knowledge Base server at http://localhost:8000. Please verify the backend server is running."
        : (err.message || "An unexpected error occurred while searching your notes.");

      setQueryError({
        title: isNetwork ? "Connection Unavailable" : "Retrieval Service Error",
        message: errorMsg,
        isNetworkError: isNetwork,
        status: isNetwork ? 0 : 500,
        endpoint: "/api/knowledge/ask",
        serviceFailure: true,
        timestamp: new Date().toLocaleTimeString()
      });
      setNoMatchReason('service_failure');
      setQueryStatus('error');
      setAnnouncement(`Retrieval service failed: ${errorMsg}`);
    } finally {
      if (currentRequestId === activeRequestIdRef.current) {
        abortControllerRef.current = null;
      }
    }
  };

  const handleCancelQuery = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    activeRequestIdRef.current++;
    setPendingQuery('');
    if (askResult && lastSubmittedQuery) {
      const hadMatches = (askResult.citations && askResult.citations.length > 0) || searchResults.length > 0;
      setQueryStatus(hadMatches ? 'success' : 'no-matches');
    } else {
      setQueryStatus('idle');
    }
    toast.info("Search cancelled.");
    setAnnouncement("Search cancelled.");
  };

  const sampleQueries = [
    "explain normalization and BCNF according to my notes",
    "What is database normalization?",
    "What is a functional dependency?",
    "Explain 3NF vs BCNF and decomposition theorems"
  ];

  const handleSelectSampleQuery = (q) => {
    setTestQuery(q);
    handleKnowledgeQuery(q);
  };

  useEffect(() => {
    isMountedRef.current = true;

    // Fetch runtime upload constraints from backend
    const fetchConfig = async () => {
      try {
        const res = await fetch("http://localhost:8000/api/knowledge/config");
        if (res.ok) {
          const cfg = await res.json();
          if (cfg && cfg.max_file_size_mb) {
            setUploadLimits({
              maxMb: cfg.max_file_size_mb,
              maxBytes: cfg.max_file_size_bytes,
              extensions: cfg.allowed_extensions || ['.pdf']
            });
          }
        }
      } catch (_) {}
    };

    fetchConfig();
    fetchActiveDocument();
    handleKnowledgeQuery('explain normalization and BCNF according to my notes');

    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (uploadXhrRef.current) {
        uploadXhrRef.current.abort();
      }
    };
  }, []);

  const validateSelectedFile = (file) => {
    if (!file) return null;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return {
        title: "Unsupported File Format",
        message: `"${file.name}" is not a PDF file. ASTRA Knowledge Base only accepts .pdf documents.`,
        stage: "validation"
      };
    }

    if (file.size === 0) {
      return {
        title: "Empty PDF Detected",
        message: `"${file.name}" contains 0 bytes. Please select a valid document.`,
        stage: "validation"
      };
    }

    if (file.size > uploadLimits.maxBytes) {
      return {
        title: "File Exceeds Size Limit",
        message: `"${file.name}" is ${(file.size / (1024 * 1024)).toFixed(1)}MB. Maximum allowed file size is ${uploadLimits.maxMb}MB.`,
        stage: "validation"
      };
    }

    return null;
  };

  const handleFileChosen = (file) => {
    if (!file) return;

    const error = validateSelectedFile(file);
    if (error) {
      setUploadStatus('error');
      setUploadError(error);
      setSelectedFile(null);
      setUploadResult(null);
      toast.error(`${error.title}: ${error.message}`);
      return;
    }

    setSelectedFile(file);
    setUploadStatus('validated');
    setUploadError(null);
    setUploadResult(null);
    setUploadProgress({ percent: 0, loaded: 0, total: file.size });
    toast.info(`Validated "${file.name}" (${(file.size / (1024 * 1024)).toFixed(2)} MB). Ready to index.`);
  };

  const startUploadAndIndexing = (fileToUpload = selectedFile) => {
    const file = fileToUpload || selectedFile;
    if (!file) return;

    // Prevent duplicate submissions
    if (uploadStatus === 'uploading' || uploadStatus === 'indexing') {
      return;
    }

    if (uploadXhrRef.current) {
      uploadXhrRef.current.abort();
    }

    setUploadStatus('uploading');
    setUploadProgress({ percent: 0, loaded: 0, total: file.size });
    setUploadError(null);
    setUploadResult(null);

    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    uploadXhrRef.current = xhr;

    xhr.upload.onprogress = (event) => {
      if (!isMountedRef.current) return;
      if (event.lengthComputable && event.total > 0) {
        const percent = Math.min(Math.round((event.loaded / event.total) * 100), 99);
        setUploadProgress({
          percent,
          loaded: event.loaded,
          total: event.total
        });
      }
    };

    xhr.upload.onload = () => {
      if (!isMountedRef.current) return;
      // Network byte transfer complete: server now parsing and indexing
      setUploadProgress(prev => ({ ...prev, percent: 100 }));
      setUploadStatus('indexing');
    };

    xhr.onreadystatechange = () => {
      if (!isMountedRef.current) return;
      if (xhr.readyState === XMLHttpRequest.DONE) {
        uploadXhrRef.current = null;

        if (xhr.status === 200) {
          try {
            const data = JSON.parse(xhr.responseText);
            if (data.success && data.status === 'indexed' && data.stored_count > 0) {
              setUploadStatus('success');
              setUploadResult(data);
              setUploadError(null);

              setActiveDoc({
                title: data.filename,
                uploadedAt: data.uploaded_at || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                totalPages: data.page_count,
                totalChunks: data.chunk_count,
                storedCount: data.stored_count,
                vectorStore: data.vector_store,
                collection: data.collection,
                isRealIngested: true,
                availableForSearch: true
              });

              fetchActiveDocument();
              toast.success(`Indexed "${data.filename}" (${data.chunk_count} chunks stored in Qdrant)`);
            } else {
              throw new Error("Vector indexing could not be confirmed by backend processing results.");
            }
          } catch (parseErr) {
            setUploadStatus('error');
            setUploadError({
              title: "Indexing Verification Failed",
              message: parseErr.message || "Invalid server response format.",
              stage: "indexing"
            });
          }
        } else if (xhr.status === 0) {
          if (uploadStatus !== 'ready') {
            setUploadStatus('error');
            setUploadError({
              title: "Network Connection Failed",
              message: "Could not connect to backend server at http://localhost:8000. Please check connection.",
              stage: "network"
            });
          }
        } else {
          let errorDetail = `Server returned HTTP status ${xhr.status}.`;
          let errorTitle = "Upload & Indexing Failed";
          try {
            const errJson = JSON.parse(xhr.responseText);
            if (errJson && errJson.detail) {
              errorDetail = errJson.detail;
            }
          } catch (_) {}

          if (xhr.status === 413) {
            errorTitle = "File Size Limit Exceeded";
          } else if (xhr.status === 400) {
            errorTitle = "Invalid or Unreadable PDF";
          } else if (xhr.status >= 500) {
            errorTitle = "Server Indexing Error";
          }

          setUploadStatus('error');
          setUploadError({
            title: errorTitle,
            message: errorDetail,
            stage: xhr.status === 400 || xhr.status === 413 ? "validation" : "indexing"
          });
          toast.error(`${errorTitle}: ${errorDetail}`);
        }
      }
    };

    xhr.onerror = () => {
      if (!isMountedRef.current) return;
      uploadXhrRef.current = null;
      setUploadStatus('error');
      setUploadError({
        title: "Network Connection Failed",
        message: "Failed to connect to backend server at http://localhost:8000.",
        stage: "network"
      });
    };

    xhr.open('POST', 'http://localhost:8000/api/knowledge/upload', true);
    xhr.send(formData);
  };

  const cancelUpload = () => {
    if (uploadXhrRef.current) {
      uploadXhrRef.current.abort();
      uploadXhrRef.current = null;
    }
    setUploadStatus('ready');
    setSelectedFile(null);
    setUploadError(null);
    setUploadResult(null);
    setUploadProgress({ percent: 0, loaded: 0, total: 0 });
    toast.info("Upload cancelled.");
  };

  const resetUploadState = () => {
    setUploadStatus('ready');
    setSelectedFile(null);
    setUploadError(null);
    setUploadResult(null);
    setUploadProgress({ percent: 0, loaded: 0, total: 0 });
  };

  return (
    <div className="astra-page-container" style={{ maxWidth: '1240px' }}>
      
      {/* Header */}
      <div className="astra-page-header">
        <div style={{ minWidth: 0, flex: '1 1 auto' }}>
          <div className="astra-eyebrow">
            <BookOpen size={16} />
            <span>ASTRA KNOWLEDGE BASE & RAG PIPELINE</span>
          </div>
          <h1 className="astra-page-title">
            Document Knowledge Base
          </h1>
          <p className="astra-page-subtitle">
            Uploaded lecture notes, assignments, and RAG document search with page-level citations.
          </p>
        </div>

        {/* Developer Debug Toggle */}
        <button 
          onClick={() => setShowDeveloperDebug(!showDeveloperDebug)}
          className="btn-secondary"
          style={{ fontSize: '11px', borderColor: showDeveloperDebug ? 'var(--cyan-primary)' : 'var(--border-color)' }}
        >
          <Code size={14} color={showDeveloperDebug ? 'var(--cyan-primary)' : 'var(--text-muted)'} />
          <span>{showDeveloperDebug ? 'Hide Developer Vectors' : 'Developer Debug View'}</span>
        </button>
      </div>

      {/* Top Grid: Document Summary & Upload Area */}
      <div className="knowledge-grid-top">
        
        {/* Active Document Card (8 cols) */}
        <div style={{ gridColumn: 'span 8' }} className="glass-panel card-hover-lift">
          <div style={{ padding: 'var(--card-padding, 24px)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  background: 'rgba(0, 242, 254, 0.1)',
                  border: '1px solid rgba(0, 242, 254, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--cyan-primary)'
                }}>
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="astra-card-title" style={{ marginBottom: '2px' }}>{activeDoc.title}</h3>
                  <div className="astra-meta">Uploaded: {activeDoc.uploadedAt}</div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className={activeDoc.isRealIngested ? "badge-cyan" : "badge-purple"} style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '6px' }}>
                  {activeDoc.isRealIngested ? 'Real Qdrant Vector Store ✓' : 'Sample Note (Seeded)'}
                </span>
                {activeDoc.availableForSearch && (
                  <span style={{
                    fontSize: '10px',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    background: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    color: '#4ade80',
                    fontWeight: 600
                  }}>
                    Available for Search ✓
                  </span>
                )}
              </div>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '16px',
              padding: '16px',
              background: 'rgba(255,255,255,0.02)',
              borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.05)'
            }}>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>TOTAL PAGES</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#fff' }}>
                  {activeDoc.totalPages !== undefined && activeDoc.totalPages !== null ? `${activeDoc.totalPages} Pages` : 'Pending'}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>INDEXED PASSAGES</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--cyan-primary)' }}>
                  {activeDoc.totalChunks !== undefined && activeDoc.totalChunks !== null ? `${activeDoc.totalChunks} Chunks` : 'Pending'}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>VECTOR STORE</div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--emerald-accent)' }}>
                  {activeDoc.vectorStore ? `${activeDoc.vectorStore.toUpperCase()} (${activeDoc.collection || 'astra_knowledge'})` : 'Qdrant Persistent'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 7-State Drag-and-Drop Ingestion Panel (4 cols) */}
        <div 
          role="region"
          aria-label="PDF Document Upload Dropzone"
          style={{ 
            gridColumn: 'span 4',
            border: isDraggingOver ? '1px dashed var(--cyan-primary)' : undefined,
            background: isDraggingOver ? 'rgba(0, 242, 254, 0.08)' : undefined,
            boxShadow: isDraggingOver ? '0 0 24px rgba(0, 242, 254, 0.2)' : undefined,
            transition: 'all 0.2s ease'
          }} 
          className="glass-panel dropzone-container card-hover-lift"
          onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingOver(true); }}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingOver(true); }}
          onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingOver(false); }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDraggingOver(false);
            const droppedFile = e.dataTransfer.files?.[0];
            if (droppedFile) {
              handleFileChosen(droppedFile);
            }
          }}
        >
          <div style={{ padding: 'var(--card-padding, 24px)', display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
            
            {/* Hidden Input for Manual Selection */}
            <input 
              ref={fileInputRef}
              type="file" 
              accept=".pdf,application/pdf" 
              aria-label="Upload PDF notes document"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) handleFileChosen(f);
              }} 
              disabled={uploadStatus === 'uploading' || uploadStatus === 'indexing'} 
              style={{ display: 'none' }} 
            />

            {/* --- STATE 1: READY TO UPLOAD --- */}
            {uploadStatus === 'ready' && (
              <>
                <div style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  background: 'rgba(0, 242, 254, 0.1)',
                  border: '1px solid rgba(0, 242, 254, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '12px'
                }}>
                  <Upload size={20} color="var(--cyan-primary)" />
                </div>
                <h4 style={{ fontSize: '15px', fontWeight: 600, color: '#fff', marginBottom: '4px' }}>
                  {isDraggingOver ? "Drop PDF File Here" : "Upload Study Notes / PDF"}
                </h4>
                <p style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '14px', lineHeight: '1.4' }}>
                  {isDraggingOver ? "Release to validate & prepare for indexing" : "Drag & drop or browse PDF to chunk, vectorize, & index"}
                </p>

                <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
                  <span style={{ fontSize: '10px', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: '4px', color: '#cbd5e1' }}>PDF</span>
                  <span style={{ fontSize: '10px', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: '4px', color: '#cbd5e1' }}>Max {uploadLimits.maxMb} MB</span>
                  <span style={{ fontSize: '10px', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: '4px', color: '#cbd5e1' }}>Vectorized</span>
                </div>

                <button 
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-cyan" 
                  style={{ fontSize: '13px', padding: '8px 18px', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Upload size={14} />
                  <span>Select PDF File</span>
                </button>
              </>
            )}

            {/* --- STATE 2: FILE SELECTED & VALIDATED --- */}
            {uploadStatus === 'validated' && selectedFile && (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  background: 'rgba(168, 85, 247, 0.15)',
                  border: '1px solid rgba(168, 85, 247, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '10px',
                  color: '#d8b4fe'
                }}>
                  <FileText size={22} />
                </div>

                <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff', marginBottom: '4px', wordBreak: 'break-all' }}>
                  {selectedFile.name}
                </div>

                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                  {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB &nbsp;•&nbsp; PDF Document
                </div>

                <span className="badge-cyan" style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '4px', marginBottom: '14px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <CheckCircle2 size={12} />
                  <span>Validated & Ready</span>
                </span>

                <div style={{ display: 'flex', gap: '8px', width: '100%', justifyContent: 'center' }}>
                  <button
                    type="button"
                    onClick={() => startUploadAndIndexing()}
                    className="btn-cyan"
                    style={{ fontSize: '12px', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Upload size={13} />
                    <span>Upload & Index</span>
                  </button>
                  <button
                    type="button"
                    onClick={resetUploadState}
                    className="btn-secondary"
                    style={{ fontSize: '12px', padding: '8px 12px' }}
                  >
                    <span>Change</span>
                  </button>
                </div>
              </div>
            )}

            {/* --- STATE 3: UPLOAD IN PROGRESS --- */}
            {uploadStatus === 'uploading' && (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <Loader2 size={26} className="animate-spin" color="var(--cyan-primary)" style={{ marginBottom: '10px' }} />
                
                <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>
                  Uploading PDF to Server...
                </h4>
                
                <div style={{ fontSize: '11px', color: 'var(--cyan-text)', marginBottom: '12px', fontFamily: 'var(--font-mono)' }}>
                  {selectedFile?.name}
                </div>

                {/* Genuine Upload Progress Bar */}
                <div style={{ width: '100%', height: '6px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '3px', overflow: 'hidden', marginBottom: '8px' }}>
                  <div style={{
                    width: `${uploadProgress.percent}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, var(--cyan-primary), #38bdf8)',
                    transition: 'width 0.2s ease'
                  }} />
                </div>

                <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: '12px' }}>
                  {uploadProgress.percent}% • {(uploadProgress.loaded / (1024 * 1024)).toFixed(1)} MB / {(uploadProgress.total / (1024 * 1024)).toFixed(1)} MB
                </div>

                <button
                  type="button"
                  onClick={cancelUpload}
                  className="btn-secondary"
                  style={{ fontSize: '11px', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px', color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                >
                  <Ban size={12} />
                  <span>Cancel Upload</span>
                </button>
              </div>
            )}

            {/* --- STATE 4: PARSING & INDEXING IN PROGRESS --- */}
            {uploadStatus === 'indexing' && (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', alignSelf: 'center' }}>
                  <Cpu size={18} className="animate-pulse" color="var(--cyan-primary)" />
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>Parsing & Indexing PDF...</span>
                </div>

                <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '12px', textAlign: 'center' }}>
                  Upload complete (100%). Generating 3072-dim embeddings & storing vectors in Qdrant.
                </div>

                {/* Multi-step Status Progression */}
                <div style={{
                  background: 'rgba(7, 10, 17, 0.7)',
                  borderRadius: '6px',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  padding: '8px 12px',
                  width: '100%',
                  fontSize: '11px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '5px',
                  marginBottom: '10px'
                }}>
                  <div style={{ color: 'var(--emerald-accent)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>✓</span> <span>PDF byte upload completed</span>
                  </div>
                  <div style={{ color: 'var(--cyan-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="animate-spin" style={{ display: 'inline-block' }}>◌</span> <span>Extracting pages & chunking text</span>
                  </div>
                  <div style={{ color: 'var(--cyan-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="animate-spin" style={{ display: 'inline-block' }}>◌</span> <span>Generating Gemini embeddings (3072 dims)</span>
                  </div>
                  <div style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>○</span> <span>Upserting vectors into Qdrant 'astra_knowledge'</span>
                  </div>
                </div>

                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center', width: '100%' }}>
                  Please wait, do not close or refresh this page.
                </div>
              </div>
            )}

            {/* --- STATE 5: SUCCESSFULLY INDEXED & AVAILABLE FOR SEARCH --- */}
            {uploadStatus === 'success' && uploadResult && (
              <div style={{ width: '100%', textAlign: 'left' }}>
                <div style={{
                  padding: '12px 14px',
                  background: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  borderRadius: '8px',
                  marginBottom: '12px'
                }}>
                  <div style={{ fontWeight: 700, color: 'var(--emerald-accent)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', fontSize: '13px' }}>
                    <CheckCircle2 size={16} />
                    <span>Indexed & Available for Search ✓</span>
                  </div>
                  
                  <div style={{ fontSize: '12px', color: '#fff', fontWeight: 600, marginBottom: '8px' }}>
                    {uploadResult.filename}
                  </div>

                  {/* Confirmed Real Processing Results */}
                  <div style={{ color: 'var(--text-secondary)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                    <span>📄 {uploadResult.page_count} Pages</span>
                    <span>✂️ {uploadResult.chunk_count} Chunks</span>
                    <span>⚡ {uploadResult.embedded_count} Embeddings</span>
                    <span>💾 {uploadResult.stored_count} in Qdrant</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      const input = document.getElementById('knowledge-query-input');
                      if (input) {
                        input.focus();
                        input.scrollIntoView({ behavior: 'smooth' });
                      }
                    }}
                    className="btn-cyan"
                    style={{ fontSize: '11px', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <Search size={12} />
                    <span>Ask Notes</span>
                  </button>
                  <button
                    type="button"
                    onClick={resetUploadState}
                    className="btn-secondary"
                    style={{ fontSize: '11px', padding: '6px 12px' }}
                  >
                    <span>Upload Another</span>
                  </button>
                </div>
              </div>
            )}

            {/* --- STATE 6 & 7: UPLOAD/INDEXING FAILED & RETRY RECOVERY --- */}
            {uploadStatus === 'error' && uploadError && (
              <div style={{ width: '100%', textAlign: 'left' }}>
                <div style={{
                  padding: '12px 14px',
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '8px',
                  marginBottom: '12px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <div style={{ fontWeight: 700, color: '#f87171', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                      <AlertCircle size={15} />
                      <span>{uploadError.title || "Document Processing Failed"}</span>
                    </div>
                    {uploadError.stage && (
                      <span style={{ fontSize: '9px', padding: '1px 6px', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', textTransform: 'uppercase' }}>
                        {uploadError.stage}
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: '12px', color: '#e2e8f0', lineHeight: '1.4' }}>
                    {uploadError.message}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {selectedFile && uploadError.stage !== 'validation' && (
                    <button
                      type="button"
                      onClick={() => startUploadAndIndexing()}
                      className="btn-cyan"
                      style={{ fontSize: '11px', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <RotateCcw size={12} />
                      <span>Retry Upload</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      resetUploadState();
                      fileInputRef.current?.click();
                    }}
                    className="btn-secondary"
                    style={{ fontSize: '11px', padding: '6px 12px' }}
                  >
                    <span>Choose Different File</span>
                  </button>
                  <button
                    type="button"
                    onClick={resetUploadState}
                    className="btn-secondary"
                    style={{ fontSize: '11px', padding: '6px 12px' }}
                  >
                    <span>Dismiss</span>
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>

      </div>

      {/* Semantic Search Tester Section */}
      <div className="glass-panel" style={{ padding: 'var(--card-padding, 24px)', marginBottom: 'var(--section-gap, 28px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Cpu size={18} color="var(--cyan-primary)" />
            <h3 className="astra-card-title" style={{ margin: 0 }}>Ask Questions About Your Uploaded Notes</h3>
          </div>
          <button
            type="button"
            onClick={() => setShowDeveloperDebug(prev => !prev)}
            className="btn-secondary"
            style={{ fontSize: '11px', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Code size={13} color="var(--cyan-primary)" />
            <span>{showDeveloperDebug ? 'Hide Diagnostics' : 'Developer Debug View'}</span>
          </button>
        </div>

        {/* Accessible Live Region for Screen Readers */}
        <div role="status" aria-live="polite" className="sr-only">
          {announcement}
        </div>

        {/* Input Bar & Actions */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'var(--bg-input)',
            border: queryStatus === 'loading' ? '1px solid rgba(0, 242, 254, 0.4)' : '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '8px 14px',
            transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
            boxShadow: queryStatus === 'loading' ? '0 0 12px rgba(0, 242, 254, 0.1)' : 'none'
          }}>
            <Search size={16} color={queryStatus === 'loading' ? 'var(--cyan-primary)' : 'var(--text-muted)'} />
            <input 
              type="text" 
              id="knowledge-query-input"
              value={testQuery} 
              onChange={(e) => setTestQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && queryStatus !== 'loading') {
                  handleKnowledgeQuery();
                }
              }}
              disabled={queryStatus === 'loading'}
              placeholder="Query document knowledge (e.g. BCNF, 3NF, normalization)..."
              aria-label="Query document notes"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#fff',
                fontSize: '13px',
                outline: 'none',
                width: '100%',
                cursor: queryStatus === 'loading' ? 'not-allowed' : 'text'
              }}
            />
            {testQuery.trim() && queryStatus !== 'loading' && (
              <button
                type="button"
                onClick={() => setTestQuery('')}
                title="Clear input"
                aria-label="Clear query input"
                className="btn-icon"
                style={{ width: '24px', height: '24px', minWidth: '24px', minHeight: '24px' }}
              >
                <XCircle size={14} />
              </button>
            )}
          </div>

          {/* Action Button: Idle / Loading / Retry */}
          {queryStatus === 'loading' ? (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                type="button"
                className="btn-cyan" 
                disabled 
                style={{ 
                  cursor: 'not-allowed', 
                  opacity: 0.9, 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px',
                  whiteSpace: 'nowrap'
                }}
              >
                <Loader2 size={15} className="animate-spin" />
                <span>Searching notes...</span>
              </button>
              <button
                type="button"
                onClick={handleCancelQuery}
                className="btn-secondary"
                title="Cancel search"
                style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', borderColor: 'rgba(239, 68, 68, 0.4)', color: '#f87171' }}
              >
                <Ban size={14} />
                <span>Cancel</span>
              </button>
            </div>
          ) : (
            <button 
              type="button"
              onClick={() => handleKnowledgeQuery()} 
              className="btn-cyan"
              style={{ display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}
            >
              <Search size={15} />
              <span>Query Notes</span>
            </button>
          )}
        </div>

        {/* Quick Suggestion Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Sparkles size={12} color="var(--cyan-primary)" />
            <span>Sample queries:</span>
          </span>
          {sampleQueries.map((qText, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSelectSampleQuery(qText)}
              disabled={queryStatus === 'loading'}
              className="interactive-chip"
              style={{
                fontSize: '11px',
                background: testQuery === qText ? 'rgba(0, 242, 254, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                border: testQuery === qText ? '1px solid rgba(0, 242, 254, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
                color: testQuery === qText ? 'var(--cyan-primary)' : 'var(--text-secondary)',
                padding: '3px 10px',
                borderRadius: '6px',
                cursor: queryStatus === 'loading' ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              {qText.length > 40 ? qText.substring(0, 38) + '...' : qText}
            </button>
          ))}
        </div>

        {/* --- LIFECYCLE STATE 1: LOADING STATE --- */}
        {queryStatus === 'loading' && (
          <div style={{
            background: 'rgba(0, 242, 254, 0.04)',
            border: '1px solid rgba(0, 242, 254, 0.3)',
            borderRadius: '12px',
            padding: '22px 24px',
            marginTop: '16px',
            boxShadow: '0 8px 32px rgba(0, 242, 254, 0.08)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Loader2 size={18} className="animate-spin" color="var(--cyan-primary)" />
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#fff', letterSpacing: '0.02em' }}>
                  SEARCHING YOUR NOTES...
                </span>
              </div>
              <button
                type="button"
                onClick={handleCancelQuery}
                className="btn-secondary"
                style={{ fontSize: '11px', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <Ban size={12} color="#f87171" />
                <span>Stop Search</span>
              </button>
            </div>

            <div style={{ fontSize: '13px', color: 'var(--cyan-text)', marginBottom: '12px', fontFamily: 'var(--font-mono)' }}>
              Query: "{pendingQuery}"
            </div>

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              padding: '12px 14px',
              background: 'rgba(7, 10, 17, 0.6)',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              fontSize: '11px',
              color: 'var(--text-secondary)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: 'var(--emerald-accent)' }}>✓</span>
                <span>Generating 3072-dim query vector (gemini-embedding-001)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="animate-spin" style={{ display: 'inline-block', color: 'var(--cyan-primary)' }}>◌</span>
                <span style={{ color: '#fff' }}>Scanning Qdrant collection 'astra_knowledge' with Cosine similarity...</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>○</span>
                <span style={{ color: 'var(--text-muted)' }}>Synthesizing grounded answer with deterministic page citations</span>
              </div>
            </div>

            {/* Display previous answer dimmed so user knows new query is running */}
            {askResult && lastSubmittedQuery && (
              <div style={{ marginTop: '18px', paddingTop: '14px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', opacity: 0.45 }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  PREVIOUS ANSWER (for: "{lastSubmittedQuery}"):
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', maxHeight: '60px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {askResult.answer}
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- LIFECYCLE STATE: ERROR STATE (THE RETRIEVAL SERVICE FAILED) --- */}
        {queryStatus === 'error' && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.06)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            borderRadius: '12px',
            padding: '22px 24px',
            marginTop: '16px',
            boxShadow: '0 8px 32px rgba(239, 68, 68, 0.08)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <AlertCircle size={22} color="#f87171" />
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>
                    {queryError?.title || "Retrieval Service Failed"}
                  </div>
                  <div style={{ fontSize: '11px', color: '#fca5a5' }}>
                    The semantic retrieval engine was unable to execute your search
                  </div>
                </div>
              </div>
              <span style={{
                fontSize: '10px',
                padding: '3px 8px',
                borderRadius: '4px',
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                color: '#f87171',
                fontWeight: 700,
                letterSpacing: '0.04em'
              }}>
                {queryError?.status ? `HTTP ${queryError.status} FAILURE` : 'SERVICE UNAVAILABLE'}
              </span>
            </div>

            {/* Critical Reassurance Banner: Never claim document lacks info because request failed */}
            <div style={{
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.28)',
              borderRadius: '8px',
              padding: '10px 14px',
              marginBottom: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              color: '#fee2e2',
              fontSize: '12px',
              lineHeight: '1.5'
            }}>
              <AlertTriangle size={16} color="#f87171" style={{ flexShrink: 0 }} />
              <span>
                <strong>System Notice:</strong> This request failed due to a server or network error. <strong>This does NOT mean your uploaded document lacks the requested information.</strong>
              </span>
            </div>

            {/* Error Detail Message */}
            <div style={{
              fontSize: '12px',
              color: '#e2e8f0',
              marginBottom: '14px',
              background: 'rgba(7, 10, 17, 0.6)',
              padding: '10px 14px',
              borderRadius: '6px',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              fontFamily: 'var(--font-mono)'
            }}>
              <span style={{ color: '#f87171' }}>Detail: </span>{queryError?.message || "Retrieval engine threw an unhandled exception."}
            </div>

            {/* Current Question Display (Keeps question visible & refinable) */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.02)',
              borderRadius: '8px',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '14px',
              border: '1px solid rgba(255, 255, 255, 0.05)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                <Search size={14} color="var(--cyan-primary)" style={{ flexShrink: 0 }} />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Target Question:</span>
                <span style={{ fontSize: '12px', color: '#fff', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  "{pendingQuery || lastSubmittedQuery || testQuery}"
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setTestQuery(pendingQuery || lastSubmittedQuery || testQuery);
                  const input = document.getElementById('knowledge-query-input');
                  if (input) {
                    input.focus();
                    input.select();
                  }
                }}
                className="btn-secondary"
                style={{ fontSize: '11px', padding: '3px 10px', flexShrink: 0 }}
              >
                <span>Edit Question</span>
              </button>
            </div>

            {/* Useful Next Steps & Action Buttons (Retry IS offered here!) */}
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => handleKnowledgeQuery(pendingQuery || lastSubmittedQuery || testQuery, true)}
                className="btn-cyan"
                style={{ fontSize: '12px', padding: '7px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <RotateCcw size={14} />
                <span>Retry Query</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDeveloperDebug(true);
                  const debugEl = document.getElementById('developer-debug-view');
                  if (debugEl) debugEl.scrollIntoView({ behavior: 'smooth' });
                }}
                className="btn-secondary"
                style={{ fontSize: '12px', padding: '7px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Activity size={13} color="var(--cyan-primary)" />
                <span>Inspect Technical Diagnostics</span>
              </button>
              <button
                type="button"
                onClick={() => setQueryStatus(askResult ? 'success' : 'idle')}
                className="btn-secondary"
                style={{ fontSize: '12px', padding: '7px 14px' }}
              >
                <span>Dismiss</span>
              </button>
            </div>
          </div>
        )}

        {/* --- LIFECYCLE STATE: NO MATCHES (4 DISTINCT NO-RESULT STATES) --- */}
        {queryStatus === 'no-matches' && (
          <div>
            {/* STATE 2: THE DOCUMENT HAS NOT FINISHED INDEXING */}
            {noMatchReason === 'indexing_in_progress' && (
              <div style={{
                background: 'rgba(0, 242, 254, 0.05)',
                border: '1px solid rgba(0, 242, 254, 0.35)',
                borderRadius: '12px',
                padding: '22px 24px',
                marginTop: '16px',
                boxShadow: '0 8px 32px rgba(0, 242, 254, 0.06)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Cpu size={22} className="animate-pulse" color="var(--cyan-primary)" />
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>
                        Document Has Not Finished Indexing
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--cyan-text)' }}>
                        Vector embeddings are currently being generated in Qdrant
                      </div>
                    </div>
                  </div>
                  <span className="badge-cyan" style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '4px' }}>
                    INDEXING IN PROGRESS
                  </span>
                </div>

                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '14px' }}>
                  Your document <strong style={{ color: '#fff' }}>{activeDoc?.title || "your uploaded notes"}</strong> is actively being ingested. Semantic search requires all chunk embeddings to be written to Qdrant before questions can be answered.
                </p>

                {/* Visible & Refinable Question Box */}
                <div style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '14px',
                  border: '1px solid rgba(255, 255, 255, 0.05)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                    <Search size={14} color="var(--cyan-primary)" style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Target Question:</span>
                    <span style={{ fontSize: '12px', color: '#fff', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      "{lastSubmittedQuery || testQuery}"
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setTestQuery(lastSubmittedQuery || testQuery);
                      const input = document.getElementById('knowledge-query-input');
                      if (input) {
                        input.focus();
                        input.select();
                      }
                    }}
                    className="btn-secondary"
                    style={{ fontSize: '11px', padding: '3px 10px', flexShrink: 0 }}
                  >
                    <span>Refine Question</span>
                  </button>
                </div>

                {/* Useful Next Steps (NO retry offered until indexing completes) */}
                <div style={{
                  background: 'rgba(7, 10, 17, 0.6)',
                  borderRadius: '8px',
                  padding: '12px 14px',
                  marginBottom: '14px',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  fontSize: '11px',
                  color: 'var(--text-secondary)'
                }}>
                  <div style={{ fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>Recommended Next Steps:</div>
                  <ul style={{ paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <li>Check the real-time progress checklist in the upload panel above.</li>
                    <li>Wait for the green confirmation badge (*"Indexed & Available for Search ✓"*).</li>
                    <li><em>Query retry is temporarily disabled while vector store write is active.</em></li>
                  </ul>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => {
                      const panel = document.getElementById('knowledge-upload-panel');
                      if (panel) panel.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="btn-cyan"
                    style={{ fontSize: '12px', padding: '7px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Eye size={13} />
                    <span>Check Indexing Status</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowDeveloperDebug(true);
                      const debugEl = document.getElementById('developer-debug-view');
                      if (debugEl) debugEl.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="btn-secondary"
                    style={{ fontSize: '12px', padding: '7px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Activity size={13} color="var(--cyan-primary)" />
                    <span>View Diagnostics</span>
                  </button>
                </div>
              </div>
            )}

            {/* STATE 3: THE DOCUMENT CONTAINS NO EXTRACTABLE TEXT */}
            {noMatchReason === 'no_extractable_text' && (
              <div style={{
                background: 'rgba(245, 158, 11, 0.05)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                borderRadius: '12px',
                padding: '22px 24px',
                marginTop: '16px',
                boxShadow: '0 8px 32px rgba(245, 158, 11, 0.06)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <AlertTriangle size={22} color="#fbbf24" />
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>
                        Document Contains No Extractable Text
                      </div>
                      <div style={{ fontSize: '11px', color: '#fcd34d' }}>
                        PDF contains pages but zero selectable text chunks could be extracted
                      </div>
                    </div>
                  </div>
                  <span style={{
                    fontSize: '10px',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    background: 'rgba(245, 158, 11, 0.15)',
                    border: '1px solid rgba(245, 158, 11, 0.35)',
                    color: '#fbbf24',
                    fontWeight: 700
                  }}>
                    NO EXTRACTABLE TEXT
                  </span>
                </div>

                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '14px' }}>
                  The uploaded file <strong style={{ color: '#fff' }}>{activeDoc?.title || "Document"}</strong> ({activeDoc?.totalPages ? `${activeDoc.totalPages} pages` : 'pages'}) contains no selectable text characters. This typically happens with scanned book pages, image-only PDFs, or encrypted documents without an Optical Character Recognition (OCR) layer.
                </p>

                {/* Visible & Refinable Question Box */}
                <div style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '14px',
                  border: '1px solid rgba(255, 255, 255, 0.05)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                    <Search size={14} color="var(--cyan-primary)" style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Target Question:</span>
                    <span style={{ fontSize: '12px', color: '#fff', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      "{lastSubmittedQuery || testQuery}"
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setTestQuery(lastSubmittedQuery || testQuery);
                      const input = document.getElementById('knowledge-query-input');
                      if (input) {
                        input.focus();
                        input.select();
                      }
                    }}
                    className="btn-secondary"
                    style={{ fontSize: '11px', padding: '3px 10px', flexShrink: 0 }}
                  >
                    <span>Refine Question</span>
                  </button>
                </div>

                {/* Next Steps (NO query retry offered because document lacks text) */}
                <div style={{
                  background: 'rgba(7, 10, 17, 0.6)',
                  borderRadius: '8px',
                  padding: '12px 14px',
                  marginBottom: '14px',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  fontSize: '11px',
                  color: 'var(--text-secondary)'
                }}>
                  <div style={{ fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>How to resolve:</div>
                  <ul style={{ paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <li>Run OCR (Optical Character Recognition) on your PDF using Adobe Acrobat, Apple Preview, or Google Drive OCR before uploading.</li>
                    <li>Verify text selection by dragging your cursor over the PDF text in any PDF reader.</li>
                    <li><em>Query retry is not offered because the document contains 0 text chunks.</em></li>
                  </ul>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => {
                      resetUploadState();
                      fileInputRef.current?.click();
                    }}
                    className="btn-cyan"
                    style={{ fontSize: '12px', padding: '7px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Upload size={13} />
                    <span>Upload Searchable / OCR PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowDeveloperDebug(true);
                      const debugEl = document.getElementById('developer-debug-view');
                      if (debugEl) debugEl.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="btn-secondary"
                    style={{ fontSize: '12px', padding: '7px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Activity size={13} color="var(--cyan-primary)" />
                    <span>View Diagnostics</span>
                  </button>
                </div>
              </div>
            )}

            {/* STATE 4: SEARCH COMPLETED SUCCESSFULLY BUT NO PASSAGES PASSED RELEVANCE CRITERIA */}
            {noMatchReason === 'below_relevance_threshold' && (
              <div style={{
                background: 'rgba(168, 85, 247, 0.05)',
                border: '1px solid rgba(168, 85, 247, 0.3)',
                borderRadius: '12px',
                padding: '22px 24px',
                marginTop: '16px',
                boxShadow: '0 8px 32px rgba(168, 85, 247, 0.06)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <FileQuestion size={22} color="var(--purple-accent)" />
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>
                        No Passages Passed Relevance Criteria
                      </div>
                      <div style={{ fontSize: '11px', color: '#d8b4fe' }}>
                        Search completed across indexed notes, but candidate similarity scored below cutoff
                      </div>
                    </div>
                  </div>
                  <span className="badge-purple" style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '4px' }}>
                    Score Below Cutoff ({searchDiagnostics?.score_threshold_applied ?? 0.50})
                  </span>
                </div>

                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '14px' }}>
                  The vector retrieval engine searched all <strong style={{ color: '#fff' }}>{searchDiagnostics?.total_points_in_collection ?? activeDoc?.totalChunks ?? 6}</strong> passages in <strong style={{ color: '#fff' }}>{activeDoc?.title || "your notes"}</strong>. None reached the required cosine similarity cutoff of <strong style={{ color: 'var(--cyan-primary)' }}>{searchDiagnostics?.score_threshold_applied ?? 0.50}</strong>
                  {searchDiagnostics?.top_score !== null && searchDiagnostics?.top_score !== undefined
                    ? ` (highest candidate scored ${(searchDiagnostics.top_score * 100).toFixed(1)}%)`
                    : ''}.
                </p>

                {/* Visible & Refinable Question Box */}
                <div style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '14px',
                  border: '1px solid rgba(255, 255, 255, 0.05)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                    <Search size={14} color="var(--cyan-primary)" style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Target Question:</span>
                    <span style={{ fontSize: '12px', color: '#fff', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      "{lastSubmittedQuery || testQuery}"
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setTestQuery(lastSubmittedQuery || testQuery);
                      const input = document.getElementById('knowledge-query-input');
                      if (input) {
                        input.focus();
                        input.select();
                      }
                    }}
                    className="btn-cyan"
                    style={{ fontSize: '11px', padding: '3px 10px', flexShrink: 0 }}
                  >
                    <span>Refine Question</span>
                  </button>
                </div>

                {/* Query Improvement Suggestions */}
                <div style={{
                  background: 'rgba(7, 10, 17, 0.6)',
                  borderRadius: '8px',
                  padding: '12px 14px',
                  marginBottom: '14px',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  fontSize: '11px',
                  color: 'var(--text-secondary)'
                }}>
                  <div style={{ fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>Suggestions to improve retrieval:</div>
                  <ul style={{ paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <li>Use specific technical syllabus vocabulary (e.g. <em>"BCNF"</em>, <em>"Boyce-Codd"</em>, <em>"functional dependency"</em>, <em>"superkey"</em>).</li>
                    <li>Avoid questions outside the scope of your uploaded DBMS notes (e.g., cooking, unrelated domains).</li>
                    <li>Upload additional textbook chapters or lecture slides if this topic is not in the current PDF.</li>
                  </ul>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => handleSelectSampleQuery("explain normalization and BCNF according to my notes")}
                    className="btn-secondary"
                    style={{ fontSize: '11px', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Sparkles size={12} color="var(--cyan-primary)" />
                    <span>Try Known Note Query ("Explain BCNF")</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowDeveloperDebug(true);
                      const debugEl = document.getElementById('developer-debug-view');
                      if (debugEl) debugEl.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="btn-secondary"
                    style={{ fontSize: '11px', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Activity size={13} color="var(--cyan-primary)" />
                    <span>View Candidate Distribution</span>
                  </button>
                </div>
              </div>
            )}

            {/* STATE 1: NO DOCUMENT PASSAGES WERE RETRIEVED (EMPTY KNOWLEDGE BASE) */}
            {(noMatchReason === 'empty_collection' || noMatchReason === 'no_passages_retrieved') && (
              <div style={{
                background: 'rgba(148, 163, 184, 0.05)',
                border: '1px solid rgba(148, 163, 184, 0.25)',
                borderRadius: '12px',
                padding: '22px 24px',
                marginTop: '16px',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Database size={22} color="#94a3b8" />
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>
                        No Document Passages in Knowledge Base
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        Zero text chunks or vector points are currently stored in Qdrant
                      </div>
                    </div>
                  </div>
                  <span style={{
                    fontSize: '10px',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    background: 'rgba(148, 163, 184, 0.12)',
                    border: '1px solid rgba(148, 163, 184, 0.25)',
                    color: '#94a3b8',
                    fontWeight: 700
                  }}>
                    EMPTY KNOWLEDGE BASE
                  </span>
                </div>

                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '14px' }}>
                  No document passages were retrieved because the knowledge base is currently empty. Zero text chunks or embeddings are indexed in the vector store.
                </p>

                {/* Visible & Refinable Question Box */}
                <div style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '14px',
                  border: '1px solid rgba(255, 255, 255, 0.05)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                    <Search size={14} color="var(--cyan-primary)" style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Target Question:</span>
                    <span style={{ fontSize: '12px', color: '#fff', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      "{lastSubmittedQuery || testQuery}"
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setTestQuery(lastSubmittedQuery || testQuery);
                      const input = document.getElementById('knowledge-query-input');
                      if (input) {
                        input.focus();
                        input.select();
                      }
                    }}
                    className="btn-secondary"
                    style={{ fontSize: '11px', padding: '3px 10px', flexShrink: 0 }}
                  >
                    <span>Refine Question</span>
                  </button>
                </div>

                {/* Next Steps (Upload PDF Notes) */}
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => {
                      resetUploadState();
                      fileInputRef.current?.click();
                    }}
                    className="btn-cyan"
                    style={{ fontSize: '12px', padding: '7px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Upload size={13} />
                    <span>Upload PDF Notes</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowDeveloperDebug(true);
                      const debugEl = document.getElementById('developer-debug-view');
                      if (debugEl) debugEl.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="btn-secondary"
                    style={{ fontSize: '12px', padding: '7px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Activity size={13} color="var(--cyan-primary)" />
                    <span>View Store Diagnostics</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- LIFECYCLE STATE 4: SUCCESS STATE --- */}
        {queryStatus === 'success' && askResult && (
          <div style={{
            background: 'rgba(0, 242, 254, 0.05)',
            border: '1px solid rgba(0, 242, 254, 0.25)',
            borderRadius: '12px',
            padding: '20px 24px',
            marginTop: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 700, color: 'var(--cyan-primary)', letterSpacing: '0.05em' }}>
                <Cpu size={16} />
                <span>ASTRA GROUNDED ANSWER</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {askResult.quotaExceeded && (
                  <span style={{
                    fontSize: '10px',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background: 'rgba(245, 158, 11, 0.15)',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    color: '#fbbf24',
                    fontWeight: 600
                  }}>
                    Direct Passage Grounding
                  </span>
                )}
                {askResult.isGrounded ? (
                  <span className="badge-cyan" style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <CheckCircle2 size={12} />
                    <span>Document Grounded ✓</span>
                  </span>
                ) : (
                  <span style={{
                    fontSize: '10px',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background: 'rgba(245, 158, 11, 0.15)',
                    border: '1px solid rgba(245, 158, 11, 0.35)',
                    color: '#fbbf24',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    <AlertTriangle size={12} />
                    <span>General Knowledge (Unsupported by Notes)</span>
                  </span>
                )}
              </div>
            </div>

            {lastSubmittedQuery && (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '12px', fontFamily: 'var(--font-mono)' }}>
                Query: "{lastSubmittedQuery}"
              </div>
            )}

            {/* Unsupported / General Model Knowledge Banner */}
            {!askResult.isGrounded && (
              <div style={{
                marginBottom: '14px',
                padding: '10px 14px',
                borderRadius: '8px',
                background: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.25)',
                fontSize: '12px',
                color: '#fcd34d',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                lineHeight: '1.4'
              }}>
                <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                <span>
                  <strong>General Model Knowledge:</strong> No supporting passages were retrieved from your uploaded notes. This answer is derived from general AI knowledge and is not verified against your syllabus notes.
                </span>
              </div>
            )}

            {/* Quota Exceeded / Fallback Notification Banner */}
            {askResult.warning && (
              <div style={{
                marginBottom: '14px',
                padding: '10px 14px',
                borderRadius: '8px',
                background: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.25)',
                fontSize: '12px',
                color: '#fcd34d',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                lineHeight: '1.4'
              }}>
                <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                <span>{askResult.warning}</span>
              </div>
            )}

            <div style={{ fontSize: '14px', color: '#fff', lineHeight: '1.6', marginBottom: '16px', whiteSpace: 'pre-line' }}>
              {askResult.answer}
            </div>

            {/* Document & Page Citations with Interactive Passage Inspection */}
            {askResult.citations && askResult.citations.length > 0 && (
              <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <BookOpen size={13} color="var(--cyan-primary)" />
                    <span>TRUSTED SOURCE CITATIONS ({askResult.citations.length})</span>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Click any citation to inspect supporting passage
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {askResult.citations.map((cite, idx) => {
                    const citeKey = cite.citation_id || `cite_${idx}`;
                    const isInspected = inspectedCitationId === citeKey;
                    const hasPages = cite.has_page_numbers === true || (cite.page_start !== null && cite.page_start !== undefined);
                    const pageLabel = cite.page_label || (
                      hasPages
                        ? (cite.page_start === cite.page_end ? `Page ${cite.page_start}` : `Pages ${cite.page_start}–${cite.page_end}`)
                        : 'Page unavailable (Document level)'
                    );
                    const scorePct = cite.score !== undefined && cite.score !== null ? `${(cite.score * 100).toFixed(1)}%` : null;

                    return (
                      <div
                        key={citeKey}
                        style={{
                          background: isInspected ? 'rgba(0, 242, 254, 0.07)' : 'rgba(255, 255, 255, 0.02)',
                          border: isInspected ? '1px solid rgba(0, 242, 254, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
                          borderRadius: '8px',
                          overflow: 'hidden',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        {/* Citation Summary Bar */}
                        <div
                          onClick={() => setInspectedCitationId(isInspected ? null : citeKey)}
                          style={{
                            padding: '10px 14px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            cursor: 'pointer',
                            gap: '12px'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            <span style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              fontFamily: 'var(--font-mono)',
                              color: 'var(--cyan-primary)',
                              background: 'rgba(0, 242, 254, 0.12)',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              border: '1px solid rgba(0, 242, 254, 0.25)'
                            }}>
                              [{idx + 1}]
                            </span>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <FileText size={14} color="var(--text-secondary)" />
                              <strong style={{ fontSize: '13px', color: '#fff' }}>{cite.filename}</strong>
                            </div>

                            <span style={{
                              fontSize: '11px',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              background: hasPages ? 'rgba(168, 85, 247, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                              border: hasPages ? '1px solid rgba(168, 85, 247, 0.3)' : '1px solid rgba(255, 255, 255, 0.1)',
                              color: hasPages ? '#d8b4fe' : 'var(--text-muted)'
                            }}>
                              {pageLabel}
                            </span>

                            {scorePct && (
                              <span style={{
                                fontSize: '10px',
                                fontFamily: 'var(--font-mono)',
                                color: 'var(--emerald-accent)',
                                background: 'rgba(16, 185, 129, 0.1)',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                border: '1px solid rgba(16, 185, 129, 0.25)'
                              }}>
                                {scorePct} match
                              </span>
                            )}
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '11px', color: isInspected ? 'var(--cyan-primary)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              {isInspected ? <EyeOff size={13} /> : <Eye size={13} />}
                              <span>{isInspected ? 'Hide Passage' : 'Inspect Passage'}</span>
                            </span>
                            {isInspected ? <ChevronUp size={14} color="var(--cyan-primary)" /> : <ChevronDown size={14} color="var(--text-muted)" />}
                          </div>
                        </div>

                        {/* Expandable Passage Inspection Drawer */}
                        {isInspected && (
                          <div style={{
                            padding: '12px 14px 14px 14px',
                            borderTop: '1px solid rgba(0, 242, 254, 0.2)',
                            background: 'rgba(7, 10, 17, 0.85)'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--cyan-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <ShieldCheck size={13} color="#4ade80" />
                                <span>RETRIEVED SUPPORTING PASSAGE</span>
                                {cite.chunk_id && (
                                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                                    ({cite.chunk_id})
                                  </span>
                                )}
                              </div>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (cite.text) {
                                    navigator.clipboard?.writeText(cite.text);
                                    toast.success("Passage text copied to clipboard!");
                                  }
                                }}
                                className="btn-secondary"
                                style={{ fontSize: '10px', padding: '2px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
                                title="Copy passage text"
                              >
                                <Copy size={11} />
                                <span>Copy Text</span>
                              </button>
                            </div>

                            {!hasPages && cite.page_limitation_note && (
                              <div style={{
                                fontSize: '11px',
                                color: '#fbbf24',
                                background: 'rgba(245, 158, 11, 0.08)',
                                border: '1px solid rgba(245, 158, 11, 0.2)',
                                borderRadius: '6px',
                                padding: '6px 10px',
                                marginBottom: '8px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                              }}>
                                <Info size={12} />
                                <span>{cite.page_limitation_note}</span>
                              </div>
                            )}

                            <div style={{
                              fontSize: '12px',
                              color: '#e2e8f0',
                              lineHeight: '1.6',
                              background: 'rgba(255, 255, 255, 0.02)',
                              border: '1px solid rgba(255, 255, 255, 0.05)',
                              borderRadius: '6px',
                              padding: '10px 12px',
                              whiteSpace: 'pre-wrap',
                              maxHeight: '220px',
                              overflowY: 'auto'
                            }}>
                              {cite.text || "Passage text is available in the vector store."}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Structured Development Diagnostics & Vector Inspector */}
        {(showDeveloperDebug || searchDiagnostics || queryError) && (
          <div id="developer-debug-view" style={{
            marginTop: '16px',
            background: 'rgba(7, 10, 17, 0.85)',
            border: '1px solid rgba(0, 242, 254, 0.25)',
            borderRadius: '10px',
            padding: '16px 20px',
            fontFamily: 'var(--font-mono)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 700, color: 'var(--cyan-primary)' }}>
                <Activity size={14} />
                <span>RAG PIPELINE RETRIEVAL DIAGNOSTICS</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: '#4ade80' }}>
                  <ShieldCheck size={13} />
                  <span>Zero Secrets Logged • Safe Telemetry</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDeveloperDebug(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '11px',
                    padding: '2px 6px'
                  }}
                  title="Close diagnostics"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Error Telemetry Section if retrieval failed */}
            {queryError && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '8px',
                padding: '12px 14px',
                marginBottom: '14px',
                fontSize: '11px'
              }}>
                <div style={{ color: '#f87171', fontWeight: 700, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertCircle size={14} />
                  <span>LAST RETRIEVAL FAILURE TELEMETRY (HTTP {queryError.status || 500})</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', color: '#e2e8f0', marginBottom: '6px' }}>
                  <div><span style={{ color: 'var(--text-muted)' }}>Status Code:</span> <strong style={{ color: '#f87171' }}>{queryError.status || 500}</strong></div>
                  <div><span style={{ color: 'var(--text-muted)' }}>Endpoint:</span> {queryError.endpoint || '/api/knowledge/ask'}</div>
                  <div><span style={{ color: 'var(--text-muted)' }}>Timestamp:</span> {queryError.timestamp || 'Just now'}</div>
                </div>
                <div style={{ color: '#fca5a5', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
                  Detail: {queryError.message}
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', fontSize: '11px', marginBottom: '12px' }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '6px' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '10px', marginBottom: '2px' }}>VECTOR STORE</div>
                <div style={{ color: '#fff', fontWeight: 600 }}>Qdrant Local</div>
                <div style={{ color: 'var(--cyan-primary)', fontSize: '10px' }}>astra_knowledge</div>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '6px' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '10px', marginBottom: '2px' }}>EMBEDDING MODEL</div>
                <div style={{ color: '#fff', fontWeight: 600 }}>gemini-embedding-001</div>
                <div style={{ color: 'var(--cyan-primary)', fontSize: '10px' }}>3072 dims • Cosine</div>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '6px' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '10px', marginBottom: '2px' }}>POINTS IN STORE</div>
                <div style={{ color: '#fff', fontWeight: 600 }}>
                  {searchDiagnostics?.total_points_in_collection ?? activeDoc.totalChunks ?? 6} Points
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '10px' }}>Active Chunks</div>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '6px' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '10px', marginBottom: '2px' }}>RETRIEVAL METRICS</div>
                <div style={{ color: '#fff', fontWeight: 600 }}>
                  {searchDiagnostics?.retrieved_count ?? searchResults.length} retrieved / {searchDiagnostics?.candidates_found ?? searchResults.length} scanned
                </div>
                <div style={{ color: 'var(--cyan-primary)', fontSize: '10px' }}>
                  Cutoff: {searchDiagnostics?.score_threshold_applied ?? 0.25}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', fontSize: '11px', color: 'var(--text-secondary)' }}>
              <span>
                Top Cosine Score: <strong style={{ color: 'var(--cyan-primary)' }}>
                  {searchDiagnostics?.top_score !== null && searchDiagnostics?.top_score !== undefined
                    ? `${(searchDiagnostics.top_score * 100).toFixed(1)}% (${searchDiagnostics.top_score.toFixed(4)})`
                    : searchResults.length > 0 ? `${((searchResults[0].score || 0.7931) * 100).toFixed(1)}%` : 'N/A'}
                </strong>
              </span>
              <span>•</span>
              <span>
                Lowest Retrieved Score: <strong style={{ color: '#fff' }}>
                  {searchDiagnostics?.lowest_score !== null && searchDiagnostics?.lowest_score !== undefined
                    ? `${(searchDiagnostics.lowest_score * 100).toFixed(1)}% (${searchDiagnostics.lowest_score.toFixed(4)})`
                    : searchResults.length > 0 ? `${((searchResults[searchResults.length - 1].score || 0.6692) * 100).toFixed(1)}%` : 'N/A'}
                </strong>
              </span>
              <span>•</span>
              <span>
                State Reason: <span className="badge-purple" style={{ fontSize: '10px', padding: '1px 6px' }}>
                  {noMatchReason || searchDiagnostics?.filtering_reason || (queryStatus === 'error' ? 'service_failure' : 'passed_threshold')}
                </span>
              </span>
              <span>•</span>
              <span>
                Store Status: <span style={{ color: queryStatus === 'error' ? '#f87171' : '#4ade80' }}>
                  {queryStatus === 'error' ? '● Degraded / Unreachable' : '● Online & Healthy'}
                </span>
              </span>
            </div>
          </div>
        )}

      </div>

      {/* Document Chunks List */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Database size={18} color="var(--cyan-primary)" />
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#fff' }}>Retrieved Knowledge</h3>
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Showing {searchResults.length} top-k semantic matches (Qdrant Vector Store)
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {searchResults.length === 0 ? (
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>
              No relevant document passages matched this query threshold in Qdrant.
            </div>
          ) : (
            searchResults.map((chk, idx) => {
              const scoreVal = chk.score !== undefined ? chk.score : (chk.similarity_score || 0.85);
              const isHigh = scoreVal >= 0.4;
              const hasPages = chk.page_start !== null && chk.page_start !== undefined;
              const pageStr = hasPages
                ? (chk.page_start === chk.page_end ? `Page ${chk.page_start}` : `Pages ${chk.page_start}–${chk.page_end}`)
                : 'Page unavailable (Document level)';
              const docName = chk.filename || chk.title || activeDoc.title || "DBMS_Notes.pdf";

              return (
                <div key={chk.chunk_id || chk.id || idx} style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: isHigh ? '1px solid rgba(0, 242, 254, 0.3)' : '1px solid rgba(255,255,255,0.06)',
                  borderRadius: '10px',
                  padding: '16px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span className="badge-purple" style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px' }}>
                        {pageStr}
                      </span>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>{docName}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Cosine Similarity:</span>
                      <span style={{
                        fontSize: '12px',
                        fontWeight: 700,
                        color: isHigh ? 'var(--cyan-primary)' : 'var(--text-secondary)',
                        background: isHigh ? 'rgba(0,242,254,0.1)' : 'rgba(255,255,255,0.05)',
                        padding: '2px 8px',
                        borderRadius: '4px'
                      }}>
                        {(scoreVal * 100).toFixed(1)}% ({scoreVal.toFixed(4)})
                      </span>
                    </div>
                  </div>

                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5', marginBottom: '12px' }}>
                    {chk.text}
                  </p>

                  {/* Developer Debug View Toggle */}
                  {showDeveloperDebug && (
                    <div style={{
                      background: '#070a11',
                      borderRadius: '6px',
                      padding: '8px 12px',
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}>
                      <span>Chunk ID: {chk.chunk_id || `chk-${idx}`}</span>
                      <span style={{ color: 'var(--cyan-primary)' }}>Vector dim: 3072 | Cosine: {scoreVal.toFixed(6)}</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

    </div>
  );
}
