import axios from "axios";

const OLLAMA_URL = "http://localhost:11434/api/generate";
const MODEL_NAME = "deepseek-r1:1.5b";

async function callOllama(prompt: string, maxTokens = 500) {
    const response = await axios.post(OLLAMA_URL, {
        model: MODEL_NAME,
        prompt,
        stream: false,
        options: {
            num_predict: maxTokens
        }
    });

    // The actual text is in response.data.response
    return response.data.response?.trim();
}

export async function generateAIResponse(query: string, dbData: any) {
    const prompt = `
Student query: ${query}
Database info: ${JSON.stringify(dbData)}
Respond as a helpful assistant:
`;
    return await callOllama(prompt, 500);
}

export async function parseStudentQuery(query: string) {
    if (!query || typeof query !== 'string' || query.trim() === '') {
        return { intent: 'Unknown', parameters: {} };
    }

    const prompt = `
You are an AI assistant for a tutoring app connecting students with experts.
Your task is to analyze a user's query and return their intent and any relevant parameters as a JSON object.
DO NOT include explanations, thoughts, or extra text—ONLY output a single valid JSON object.

Valid intents: "FAQ", "Booking", "Reviews", "Payments", "Unknown".

Rules:
1. Treat any query where the user wants to find, search for, or book experts (with or without a specific date or skill) as a "Booking" intent.
2. Extract parameters for each intent if present:
   - "Booking": { "skill": string, "date": string (YYYY-MM-DD) }
   - "Reviews": { "expertId": string }
   - "Payments": { "studentId": string }
   - "FAQ": {}
3. Omit any parameter that cannot be determined from the query.
4. If the intent cannot be determined, return: {"intent":"Unknown","parameters":{}}
5. Always return the JSON object in this exact format:
   {"intent":"FAQ|Booking|Reviews|Payments|Unknown","parameters":{...}}

Examples:
User query: "Find experts with Machine Learning skills on next day"
{"intent":"Booking","parameters":{"skill":"Machine Learning","date":"<tomorrow's date in YYYY-MM-DD>"}}

User query: "I want to book a Python expert for tomorrow"
{"intent":"Booking","parameters":{"skill":"Python","date":"<tomorrow's date in YYYY-MM-DD>"}}

User query: "How do I pay for a session?"
{"intent":"FAQ","parameters":{}}

User query: "Show me reviews for expert 123"
{"intent":"Reviews","parameters":{"expertId":"123"}}

User query: "What's my payment history?"
{"intent":"Payments","parameters":{}}

User query: "Just saying hi"
{"intent":"Unknown","parameters":{}}

Now analyze this query:
User query: "${query.trim()}"
`;

    try {
        const response = await callOllama(prompt, 1000);

        if (!response) {
            return { intent: 'Unknown', parameters: {} };
        }

        console.log('=================response===================');
        console.log(response);
        console.log('====================================');

        const jsonMatches = response.match(/\{[\s\S]*?\}/g);
        let jsonString = '';
        if (jsonMatches && jsonMatches.length > 0) {
            jsonString = jsonMatches[jsonMatches.length - 1];
        }
        const result = JSON.parse(jsonString + '}')

        return result;
    } catch (err) {
        console.error('Error processing query:', {
            query,
            error: err.message,
            stack: err.stack
        });
        return { intent: 'Unknown', parameters: {} };
    }
}
