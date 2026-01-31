
import os
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv('cloud/.env')

api_key = os.getenv('GOOGLE_API_KEY')
if not api_key:
    print("Error: GOOGLE_API_KEY not found in cloud/.env")
    exit(1)

genai.configure(api_key=api_key)

print("Listing available Gemini models:")
try:
    for m in genai.list_models():
        if 'gemini' in m.name:
            print(f"- {m.name} (DisplayName: {m.display_name})")
except Exception as e:
    print(f"Error listing models: {e}")
