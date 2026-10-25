import requests
import os

def test_step4a_and_phase1_regressions():
    print("==================================================")
    print("RUNNING STEP 4A & PHASE 1 REGRESSION TESTS")
    print("==================================================")

    # 1. Step 4A Upload Endpoint Test
    from rag.test_ingestion import create_mock_pdf_file
    upload_url = "http://localhost:8000/api/knowledge/upload"
    pdf_path = os.path.abspath("sample_dbms_test_doc.pdf")
    if not os.path.exists(pdf_path):
        pdf_path = create_mock_pdf_file("sample_dbms_test_doc.pdf")
    
    with open(pdf_path, "rb") as f:
        files = {"file": ("sample_dbms_test_doc.pdf", f, "application/pdf")}
        res_upload = requests.post(upload_url, files=files)

    print(f"Upload API Status: {res_upload.status_code}")
    assert res_upload.status_code == 200
    upload_data = res_upload.json()
    assert upload_data["success"] is True
    print(f"[REGRESSION PASS] Step 4A Upload API works: stored_count={upload_data['stored_count']}")

    # 2. Phase 1 Chat & Time/State API Test
    chat_url = "http://localhost:8000/api/chat"
    chat_payload = {
        "query": "What tasks do I have scheduled for today?",
        "history": []
    }
    res_chat = requests.post(chat_url, json=chat_payload)
    print(f"Chat API Status: {res_chat.status_code}")
    assert res_chat.status_code == 200
    chat_data = res_chat.json()
    assert "reply" in chat_data and len(chat_data["reply"]) > 0
    print(f"[REGRESSION PASS] Phase 1 Chat API works: reply='{chat_data['reply'][:60]}...'")

    # 3. Health check
    health_res = requests.get("http://localhost:8000/api/health")
    assert health_res.status_code == 200
    print("[REGRESSION PASS] System health endpoint online.")

    print("\nALL REGRESSION TESTS PASSED CLEANLY!")

if __name__ == "__main__":
    test_step4a_and_phase1_regressions()
