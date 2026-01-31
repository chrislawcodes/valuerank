
import os
import requests
import json
import sys

# Load env manually since we are outside the app context
def load_env():
    env_path = os.path.join(os.getcwd(), 'cloud', '.env')
    print(f"Loading env from {env_path}")
    with open(env_path, 'r') as f:
        for line in f:
            if line.startswith('GOOGLE_API_KEY='):
                return line.split('=', 1)[1].strip().strip('"')
    return None

API_KEY = load_env()
if not API_KEY:
    print("Error: GOOGLE_API_KEY not found in .env")
    sys.exit(1)

MODEL = "gemini-2.5-pro"
URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent?key={API_KEY}"

headers = {"Content-Type": "application/json"}

# Use essentially the same payload as the adapter, including the safety fix
payload = {
    "contents": [{"role": "user", "parts": [{"text": "Hello, are you working?"}]}],
    "generationConfig": {
        "temperature": 0.7
    },
    "safetySettings": [
        {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
        {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
        {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
        {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
        {"category": "HARM_CATEGORY_CIVIC_INTEGRITY", "threshold": "BLOCK_NONE"},
    ]
}

print(f"Calling URL: {URL.replace(API_KEY, 'HIDDEN_KEY')}")
print(f"Payload: {json.dumps(payload, indent=2)}")

try:
    response = requests.post(URL, headers=headers, json=payload, timeout=30)
    print(f"\nStatus Code: {response.status_code}")
    print("Response Body:")
    print(response.text)
except Exception as e:
    print(f"Error: {e}")
