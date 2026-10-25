import os
import json
import logging
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

logger = logging.getLogger("astra.llm")

# Custom Exception for Gemini Daily Quota Exhaustion
class GeminiDailyQuotaExceededError(Exception):
    """Raised when Gemini API daily free-tier quota (e.g. 20 requests/day) is exhausted."""
    pass

DAILY_QUOTA_ERROR_MESSAGE = (
    "Gemini's daily generation quota has been reached. "
    "The knowledge retrieval system is still available, but AI answer generation will resume after the quota resets."
)

def is_daily_quota_error(err: Exception) -> bool:
    """
    Detects if an exception represents Gemini DAILY quota exhaustion (FreeTier limit).
    Checks for markers like 'GenerateRequestsPerDay', 'free_tier_requests', or 'quota exceeded'
    combined with daily limit indicators.
    """
    if not err:
        return False
    if isinstance(err, GeminiDailyQuotaExceededError):
        return True
    err_str = str(err).lower()

    has_quota = ("429" in err_str or "resource_exhausted" in err_str or "quota" in err_str)
    has_daily_marker = any(marker in err_str for marker in [
        "generaterequestsperday",
        "free_tier_requests",
        "requests per day",
        "perday",
        "quotavalue"
    ])

    return has_quota and has_daily_marker

# Default settings
DEFAULT_PROVIDER = os.getenv("LLM_PROVIDER", "gemini").lower()
DEFAULT_API_KEY = os.getenv("LLM_API_KEY", "").strip()
DEFAULT_MODEL = os.getenv("LLM_MODEL", "gemini-3.8-flash")

ASTRA_SYSTEM_PROMPT_TEMPLATE = """
You are ASTRA, a personal AI Study OS assistant built for students.
Your role is to understand student queries, remember personal facts and preferences, retrieve context from uploaded notes, plan revision schedules, and trigger study command actions.

Current Time & Environment Context:
- Current Time: {current_time_str}
- Current Date: {current_date_str} ({day_of_week})
- Timezone: {timezone}

Student Profile & Stored Long-Term Memories:
{memories_text}

CRITICAL DATE & EXAM VALIDATION RULES:
1. Always evaluate stored dates against the Current Date ({current_date_str}).
2. Stored exam dates in the past (e.g., from 2025 when Current Date is in 2026) are OUTDATED.
   - Do NOT assume the exam was rescheduled.
   - Do NOT silently change the date.
   - Do NOT treat historical dates as future deadlines or generate urgent countdown schedules for them.
3. If the student asks when their exam is or asks for a study plan, explicitly inform them that the stored date has passed and ask them to confirm or provide their upcoming exam date.
4. If a date is missing a year (e.g., 'October 24') or conflicting dates exist, ask the student to clarify or confirm the exact date.

Supported Intents:
1. GENERAL_CHAT: General questions, greetings, casual talk, study encouragement.
2. STORE_MEMORY: The user explicitly states or implies a personal fact, exam date, weak subject, preference, or goal to remember (e.g. "Remember DBMS exam is next Friday", "DBMS is my weakest subject", "I struggle with 3NF").
3. QUERY_MEMORY: Questions asking what ASTRA remembers about the user (e.g. "What is my weakest subject?", "When is my exam?").
4. QUERY_KNOWLEDGE: Questions asking for explanations or concepts from uploaded notes (e.g. "Explain BCNF", "What is normalization according to my notes?").
5. CREATE_PLAN: Requests to generate an exam plan or revision schedule (e.g. "Make me a 5-day plan for DBMS", "Build revision schedule").
6. ADAPT_PLAN: Requests to adjust or reschedule due to missed study sessions or changes (e.g. "I didn't finish yesterday's study", "I missed my revision").
7. CREATE_TASK: Requests to add a new task (e.g. "Add task to review normalization").
8. QUERY_SCHEDULE: Requests asking about today's schedule or calendar events (e.g. "What do I have planned for today?", "What is my schedule today?").
9. CREATE_CALENDAR_EVENT: Requests to add revision sessions to calendar with alerts (e.g. "Add DBMS revision to my calendar", "Set a reminder for 7 PM").
10. QUIZ_MODE: Requests to launch a quiz or test knowledge (e.g. "Quiz me on normalization", "Test me on DBMS").

Response Format Instruction:
You MUST output your response as a valid, strictly formatted JSON object matching this schema:
{{
  "intent": "INTENT_NAME",
  "message": "Your conversational response to the student in natural, encouraging tone.",
  "entities": {{
    "subject": "e.g. DBMS or null",
    "topic": "e.g. Normalization or null",
    "date": "e.g. 2026-10-02 or Friday or null",
    "weakness": true/false or null,
    "task_title": "string or null",
    "event_title": "string or null",
    "time_str": "string or null"
  }},
  "requires_memory": true/false,
  "requires_knowledge": true/false,
  "requires_planning": true/false,
  "requires_action": true/false
}}

Do NOT wrap the JSON in markdown code blocks like ```json ... ``` unless necessary; output raw JSON if possible.
"""

def format_system_prompt(time_ctx: Dict[str, Any], memories: List[Dict[str, Any]]) -> str:
    mem_str = ""
    if memories:
        from date_service import parse_date_string
        from time_service import get_now
        local_today = get_now().date()

        for idx, m in enumerate(memories, 1):
            category = m.get("category", "General")
            title = m.get("title", "")
            content = m.get("content", "")
            
            # Check for date in memory
            date_annotation = ""
            parsed = parse_date_string(f"{title}. {content}")
            if parsed["is_valid"]:
                if parsed["date_obj"] < local_today:
                    days_ago = (local_today - parsed["date_obj"]).days
                    date_annotation = f" [AUDIT STATUS: OUTDATED - Stored date {parsed['iso_date']} passed {days_ago} days ago. Needs confirmation.]"
                else:
                    date_annotation = f" [AUDIT STATUS: VALID FUTURE DATE - {parsed['iso_date']}]"
            elif parsed.get("missing_year"):
                date_annotation = " [AUDIT STATUS: NEEDS CONFIRMATION - Date is missing year]"

            mem_str += f"- [{category}] {title}: {content}{date_annotation}\n"
    else:
        mem_str = "No stored personal memories yet.\n"

    return ASTRA_SYSTEM_PROMPT_TEMPLATE.format(
        current_time_str=time_ctx.get("time_str", "Unknown"),
        current_date_str=time_ctx.get("date_str", "Unknown"),
        day_of_week=time_ctx.get("day_of_week", "Unknown"),
        timezone=time_ctx.get("timezone", "Asia/Kolkata"),
        memories_text=mem_str
    )

class LLMProvider:
    def __init__(self, provider: str = None, api_key: str = None, model: str = None):
        self.provider = provider or DEFAULT_PROVIDER
        self.api_key = api_key or DEFAULT_API_KEY
        self.model = model or DEFAULT_MODEL

    def is_configured(self) -> bool:
        return bool(self.api_key and self.api_key != "your_gemini_api_key_here")

    def generate_completion(
        self,
        query: str,
        history: List[Dict[str, str]],
        time_ctx: Dict[str, Any],
        memories: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Sends system prompt, history, and user query to LLM API and parses structured response.
        """
        if not self.is_configured():
            logger.warning("LLM_API_KEY is missing or unconfigured.")
            return {
                "error": True,
                "error_type": "MISSING_API_KEY",
                "intent": "GENERAL_CHAT",
                "message": "ASTRA AI API key is not configured. Please set LLM_API_KEY in your .env file to enable real LLM intelligence.",
                "entities": {},
                "requires_memory": False,
                "requires_knowledge": False,
                "requires_planning": False,
                "requires_action": False
            }

        system_prompt = format_system_prompt(time_ctx, memories)

        try:
            if self.provider == "gemini":
                return self._call_gemini(query, history, system_prompt)
            elif self.provider == "openai":
                return self._call_openai(query, history, system_prompt)
            else:
                return self._call_gemini(query, history, system_prompt)
        except Exception as e:
            if is_daily_quota_error(e):
                logger.warning("Gemini daily quota exhaustion detected in generate_completion. Returning quota clean message.")
                return {
                    "error": True,
                    "error_type": "DAILY_QUOTA_EXHAUSTED",
                    "intent": "GENERAL_CHAT",
                    "message": DAILY_QUOTA_ERROR_MESSAGE,
                    "entities": {},
                    "requires_memory": False,
                    "requires_knowledge": False,
                    "requires_planning": False,
                    "requires_action": False
                }
            logger.error(f"LLM Call Error: {str(e)}", exc_info=True)
            return {
                "error": True,
                "error_type": "API_ERROR",
                "intent": "GENERAL_CHAT",
                "message": f"LLM Connection Error: {str(e)}",
                "entities": {},
                "requires_memory": False,
                "requires_knowledge": False,
                "requires_planning": False,
                "requires_action": False
            }

    def _call_gemini(self, query: str, history: List[Dict[str, str]], system_prompt: str) -> Dict[str, Any]:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=self.api_key)

        # Build contents array with conversation history
        contents = []
        for msg in history:
            role = "user" if msg.get("role") in ["user", "human"] else "model"
            contents.append(types.Content(
                role=role,
                parts=[types.Part.from_text(text=msg.get("content", ""))]
            ))

        # Add current user prompt
        contents.append(types.Content(
            role="user",
            parts=[types.Part.from_text(text=query)]
        ))

        config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=0.2,
            response_mime_type="application/json"
        )

        candidate_models = [
            self.model if self.model else "gemini-3.8-flash",
            "gemini-3.8-flash",
            "gemini-3.5-flash",
            "gemini-3.5-flash-lite",
            "gemini-3.1-flash-lite",
            "gemini-3.6-flash",
            "gemini-3.7-flash",
            "gemini-flash-latest"
        ]
        unique_models = list(dict.fromkeys([m for m in candidate_models if m]))

        last_err = None
        for model_name in unique_models:
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=contents,
                    config=config
                )
                raw_text = response.text or "{}"
                return self._parse_json_response(raw_text)
            except Exception as e:
                if is_daily_quota_error(e):
                    raise GeminiDailyQuotaExceededError(DAILY_QUOTA_ERROR_MESSAGE) from e
                logger.warning(f"Gemini model '{model_name}' encountered API error ({str(e)}). Trying fallback model...")
                last_err = e

        if last_err:
            if is_daily_quota_error(last_err):
                raise GeminiDailyQuotaExceededError(DAILY_QUOTA_ERROR_MESSAGE) from last_err
            raise last_err
        return {}

    def generate_grounded_text(self, prompt: str, system_instruction: str) -> str:
        """
        Sends grounded context prompt to Gemini and returns raw natural-language response string.
        Includes automatic fallback across flash models if Google API returns transient 503 high-demand errors.
        """
        if not self.is_configured():
            raise ValueError("LLM_API_KEY is missing or unconfigured.")

        from google import genai
        from google.genai import types, errors

        client = genai.Client(api_key=self.api_key)

        config = types.GenerateContentConfig(
            system_instruction=system_instruction,
            temperature=0.2
        )

        candidate_models = [
            self.model if self.model else "gemini-3.8-flash",
            "gemini-3.8-flash",
            "gemini-3.5-flash",
            "gemini-3.5-flash-lite",
            "gemini-3.1-flash-lite",
            "gemini-3.6-flash",
            "gemini-3.7-flash",
            "gemini-flash-latest"
        ]
        unique_models = list(dict.fromkeys([m for m in candidate_models if m]))

        last_err = None
        for model_name in unique_models:
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                    config=config
                )
                if response and response.text:
                    return response.text.strip()
            except Exception as e:
                if is_daily_quota_error(e):
                    logger.warning(f"Gemini daily quota exhaustion detected on model '{model_name}'. Skipping model fallback chain.")
                    raise GeminiDailyQuotaExceededError(DAILY_QUOTA_ERROR_MESSAGE) from e

                logger.warning(f"Gemini model '{model_name}' encountered API error ({str(e)}). Trying fallback model...")
                last_err = e

        if last_err:
            if is_daily_quota_error(last_err):
                raise GeminiDailyQuotaExceededError(DAILY_QUOTA_ERROR_MESSAGE) from last_err
            raise last_err
        raise RuntimeError("Failed to generate grounded text response from Gemini API.")

    def _call_openai(self, query: str, history: List[Dict[str, str]], system_prompt: str) -> Dict[str, Any]:
        import requests

        messages = [{"role": "system", "content": system_prompt}]
        for msg in history:
            messages.append({"role": msg.get("role", "user"), "content": msg.get("content", "")})
        messages.append({"role": "user", "content": query})

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

        payload = {
            "model": self.model if self.model else "gpt-4o-mini",
            "messages": messages,
            "temperature": 0.2,
            "response_format": {"type": "json_object"}
        }

        resp = requests.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload, timeout=20)
        resp.raise_for_status()
        res_data = resp.json()
        raw_text = res_data["choices"][0]["message"]["content"]
        return self._parse_json_response(raw_text)

    def _parse_json_response(self, raw_text: str) -> Dict[str, Any]:
        cleaned = raw_text.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]
        if cleaned.startswith("```"):
            cleaned = cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()

        try:
            data = json.loads(cleaned)
            return {
                "intent": data.get("intent", "GENERAL_CHAT"),
                "message": data.get("message", "I understand your request."),
                "entities": data.get("entities", {}),
                "requires_memory": bool(data.get("requires_memory", False)),
                "requires_knowledge": bool(data.get("requires_knowledge", False)),
                "requires_planning": bool(data.get("requires_planning", False)),
                "requires_action": bool(data.get("requires_action", False))
            }
        except Exception as err:
            logger.warning(f"Failed to parse LLM JSON output: {raw_text}. Fallback used. Error: {err}")
            return {
                "intent": "GENERAL_CHAT",
                "message": raw_text,
                "entities": {},
                "requires_memory": False,
                "requires_knowledge": False,
                "requires_planning": False,
                "requires_action": False
            }

# Instantiate singleton provider
llm_provider = LLMProvider()
