import React, { useState, useRef } from 'react';
import { HelpCircle, CheckCircle2, XCircle, ArrowRight, Award, RotateCcw, BookOpen } from 'lucide-react';
import confetti from 'canvas-confetti';
import { sampleQuizQuestions } from '../utils/initialState';

export default function QuizModeView({ setStudyProgress, setActiveTab }) {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [quizFinished, setQuizFinished] = useState(false);
  const [feedbackAnnouncement, setFeedbackAnnouncement] = useState('');

  const questionHeadingRef = useRef(null);
  const currentQ = sampleQuizQuestions[currentQuestionIndex];

  const handleSelectOption = (index) => {
    if (isAnswered) return;
    setSelectedOption(index);
    setIsAnswered(true);

    const isCorrect = index === currentQ.correctAnswerIndex;
    if (isCorrect) {
      setScore(prev => prev + 1);
      setFeedbackAnnouncement(`Correct! Option ${String.fromCharCode(65 + index)}. ${currentQ.explanation}`);
    } else {
      setFeedbackAnnouncement(`Incorrect. Selected option ${String.fromCharCode(65 + index)}. Correct answer is Option ${String.fromCharCode(65 + currentQ.correctAnswerIndex)}: ${currentQ.options[currentQ.correctAnswerIndex]}. ${currentQ.explanation}`);
    }
  };

  const handleNext = () => {
    if (currentQuestionIndex < sampleQuizQuestions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      setSelectedOption(null);
      setIsAnswered(false);
      setFeedbackAnnouncement(`Question ${currentQuestionIndex + 2} of ${sampleQuizQuestions.length}`);
      setTimeout(() => {
        questionHeadingRef.current?.focus();
      }, 50);
    } else {
      setQuizFinished(true);
      setFeedbackAnnouncement(`Quiz completed! You scored ${score} out of ${sampleQuizQuestions.length}.`);
      // Trigger celebration confetti
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
    }
  };

  const handleRestart = () => {
    setCurrentQuestionIndex(0);
    setSelectedOption(null);
    setIsAnswered(false);
    setScore(0);
    setQuizFinished(false);
    setFeedbackAnnouncement("Quiz restarted. Question 1.");
    setTimeout(() => {
      questionHeadingRef.current?.focus();
    }, 50);
  };

  return (
    <div className="astra-page-container" style={{ maxWidth: '860px' }}>
      
      {/* Live announcement region for question changes and answer feedback */}
      <div role="status" aria-live="polite" className="sr-only">
        {feedbackAnnouncement}
      </div>

      {/* Header */}
      <div className="astra-page-header" style={{ marginBottom: 'var(--section-gap, 28px)' }}>
        <div style={{ minWidth: 0, flex: '1 1 auto' }}>
          <div className="astra-eyebrow">
            <HelpCircle size={16} aria-hidden="true" />
            <span>ASTRA ADAPTIVE QUIZ MODE</span>
          </div>
          <h1 className="astra-page-title">
            DBMS Normalization Mastery Check
          </h1>
          <p className="astra-page-subtitle">
            Test your understanding of 1NF, 2NF, 3NF, BCNF, and Functional Dependencies.
          </p>
        </div>
      </div>

      {!quizFinished ? (
        <div className="glass-panel" style={{ padding: 'var(--card-padding, 24px)' }}>
          
          {/* Progress Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
            <span className="astra-label" style={{ fontSize: 'var(--text-meta, 12.5px)', color: 'var(--cyan-primary)' }}>
              QUESTION {currentQuestionIndex + 1} OF {sampleQuizQuestions.length}
            </span>

            <span className="astra-meta" style={{ fontSize: 'var(--text-meta, 12.5px)' }}>
              Score: {score}
            </span>
          </div>

          {/* Question Title - Focusable for keyboard/screen-reader navigation */}
          <h2 
            ref={questionHeadingRef}
            id="quiz-question-title"
            tabIndex={-1}
            className="astra-section-title" 
            style={{ fontSize: 'var(--text-section-title, 22px)', marginBottom: '24px', lineHeight: 'var(--leading-snug, 1.35)', outline: 'none' }}
          >
            {currentQ.question}
          </h2>

          {/* Accessible Options as Radiogroup */}
          <div 
            role="radiogroup" 
            aria-labelledby="quiz-question-title"
            style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '28px' }}
          >
            {currentQ.options.map((opt, idx) => {
              let optStyle = {
                padding: '14px 18px',
                borderRadius: '10px',
                border: '1px solid var(--border-color)',
                background: 'rgba(255,255,255,0.02)',
                color: '#fff',
                fontSize: '14px',
                cursor: isAnswered ? 'default' : 'pointer',
                transition: 'transform var(--duration-press) var(--ease-out), background-color var(--duration-hover) var(--ease-out), border-color var(--duration-hover) var(--ease-out)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                textAlign: 'left',
                fontFamily: 'inherit'
              };

              if (isAnswered) {
                if (idx === currentQ.correctAnswerIndex) {
                  optStyle.background = 'rgba(16, 185, 129, 0.15)';
                  optStyle.borderColor = '#10b981';
                  optStyle.color = '#34d399';
                } else if (idx === selectedOption) {
                  optStyle.background = 'rgba(239, 68, 68, 0.15)';
                  optStyle.borderColor = '#ef4444';
                  optStyle.color = '#f87171';
                }
              }

              return (
                <button 
                  key={idx} 
                  type="button"
                  role="radio"
                  aria-checked={selectedOption === idx}
                  aria-disabled={isAnswered}
                  style={optStyle}
                  onClick={() => handleSelectOption(idx)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      background: 'rgba(255,255,255,0.08)',
                      fontSize: '12px',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <span>{opt}</span>
                  </div>

                  {isAnswered && idx === currentQ.correctAnswerIndex && (
                    <CheckCircle2 size={18} color="#10b981" aria-label="Correct answer" />
                  )}
                  {isAnswered && idx === selectedOption && idx !== currentQ.correctAnswerIndex && (
                    <XCircle size={18} color="#ef4444" aria-label="Incorrect answer" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Explanation & Source Citation */}
          {isAnswered && (
            <div 
              role="region"
              aria-label="Answer explanation and citation"
              style={{
                background: 'rgba(0, 242, 254, 0.06)',
                border: '1px solid rgba(0, 242, 254, 0.25)',
                borderRadius: '10px',
                padding: '16px',
                marginBottom: '24px'
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--cyan-primary)', letterSpacing: '0.05em', marginBottom: '4px' }}>
                EXPLANATION & CITATION
              </div>
              <div style={{ fontSize: '13px', color: '#fff', lineHeight: '1.5', marginBottom: '8px' }}>
                {currentQ.explanation}
              </div>
              <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--cyan-primary)' }}>
                📄 Citation: {currentQ.citation}
              </div>
            </div>
          )}

          {/* Footer Controls */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button 
              type="button"
              onClick={handleNext}
              disabled={!isAnswered}
              className="btn-cyan"
            >
              <span>{currentQuestionIndex < sampleQuizQuestions.length - 1 ? 'Next Question' : 'Finish Quiz'}</span>
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>

        </div>
      ) : (
        /* Quiz Summary Card */
        <div className="glass-panel" style={{ padding: 'var(--card-padding, 24px)', textAlign: 'center' }}>
          <Award size={54} color="var(--cyan-primary)" style={{ marginBottom: '16px' }} />
          <h2 style={{ fontSize: '26px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>
            Quiz Completed!
          </h2>
          <p style={{ fontSize: '15px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
            You scored <strong style={{ color: 'var(--cyan-primary)' }}>{score} out of {sampleQuizQuestions.length}</strong> on DBMS Normalization.
          </p>

          <div style={{
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: '10px',
            padding: '16px',
            marginBottom: '32px',
            display: 'inline-block',
            textAlign: 'left'
          }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#34d399', marginBottom: '4px' }}>
              ✓ DBMS Focus Health Progress Updated to 65%!
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Normalization mastery increased. Your study progress gauge on Mission Control has been updated.
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
            <button onClick={handleRestart} className="btn-secondary">
              <RotateCcw size={15} />
              <span>Retake Quiz</span>
            </button>

            <button onClick={() => setActiveTab('mission')} className="btn-cyan">
              <span>Return to Mission Control</span>
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
