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
    // Input validation
    if (!query || typeof query !== 'string' || query.trim() === '') {
        return { intent: 'Unknown', parameters: {} };
    }

    const prompt = `
You are an AI assistant for a tutoring app. Your task is to analyze a user's query and determine their intent and relevant parameters.
- Your ONLY output must be valid JSON.
- Do NOT include any explanations or additional text outside the JSON.
- Valid intents are: "FAQ", "Booking", "Reviews", "Payments", or "Unknown".
- Include relevant parameters extracted from the query in the "parameters" object.
- If no specific parameters can be extracted, return an empty parameters object.
- If the intent cannot be determined, return {"intent":"Unknown","parameters":{}}

Return format:
{"intent":"FAQ|Booking|Reviews|Payments|Unknown","parameters":{...}}

User query: "${query.trim()}"
`;

    try {
        const result = await callOllama(prompt, 200);

        // Check if result is valid
        if (!result) {
            return { intent: 'Unknown', parameters: {} };
        }


        console.log('=============result=======================');
        console.log(JSON.stringify(result));
        console.log('====================================');

        // Parse the result
        const parsedResult = JSON.parse(result);


        console.log('=============parsedResult=======================');
        console.log(parsedResult);
        console.log('====================================');

        // Validate the parsed result structure
        if (!parsedResult.intent || !['FAQ', 'Booking', 'Reviews', 'Payments', 'Unknown'].includes(parsedResult.intent)) {
            return { intent: 'Unknown', parameters: {} };
        }
        if (!parsedResult.parameters || typeof parsedResult.parameters !== 'object') {
            parsedResult.parameters = {};
        }

        return parsedResult;
    } catch (err) {
        console.error('Error processing query:', {
            query,
            error: err.message,
            stack: err.stack
        });
        return { intent: 'Unknown', parameters: {} };
    }
}
