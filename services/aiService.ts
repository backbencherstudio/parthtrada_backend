import axios from "axios";

const OLLAMA_URL = "http://localhost:11434/api/generate";
const MODEL_NAME = "deepseek-r1:1.5b";

/**
 * Call Ollama AI API with prompt
 */
async function callOllama(prompt: string, maxTokens = 500) {
    const response = await axios.post(OLLAMA_URL, {
        model: MODEL_NAME,
        prompt,
        stream: false,
        options: { num_predict: maxTokens },
    });

    console.log('============ollama response========================');
    console.log(response.data.response?.trim());
    console.log('====================================');

    return response.data.response?.trim();
}

/**
 * Generate AI response based on query + DB data + optional chat context
 */
export async function generateAIResponse(query: string, dbData: any, chatContext: any[] = []) {
    const contextText = chatContext
        .map(msg => `${msg.isAI ? "AI" : "User"}: ${msg.content}`)
        .join("\n");

    const prompt = `
You are an AI assistant for the True Note App, a premium platform connecting students with verified experts.
You have access to the following database information about experts, reviews, and transactions:

${JSON.stringify(dbData, null, 2)}

Conversation history:
${chatContext.map(msg => `${msg.isAI ? "AI" : "User"}: ${msg.content}`).join("\n")}

Guidelines:

1. ONLY use information available in the database above.
2. DO NOT include explanations, thoughts, or <think> blocks.
3. DO NOT make up names, skills, or reviews that are not in the database.
4. DO NOT provide generic advice or speculate.
5. If the database does not contain relevant information, respond ONLY with: "No data available for this query."
6. Your response should be a direct, concise answer suitable for the student on the True Note App.
7. NEVER include <think> or any reasoning steps in your output.

User query: "${query}"
Respond with a clear, direct answer based ONLY on the database above.
`;


    return await callOllama(prompt, 2000);
}

/**
 * Parse student query into structured intent and parameters
 */
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

        // Extract the last valid JSON object from the response
        const jsonMatches = response.match(/\{[\s\S]*?\}/g);
        let result: any = { intent: 'Unknown', parameters: {} };
        if (jsonMatches && jsonMatches.length > 0) {
            for (let i = jsonMatches.length - 1; i >= 0; i--) {
                try {
                    result = JSON.parse(jsonMatches[i]);
                    break;
                } catch { /* skip invalid */ }
            }
        }

        // Normalize parameters
        if (result.intent === "Booking") {
            // Skill synonyms
            if (result.parameters.skill) {
                const skill = String(result.parameters.skill).trim();
                // Add more synonyms as needed
                const skillMap: Record<string, string> = {
                    "ml": "Machine Learning",
                    "machine learning": "Machine Learning",
                    "ML Expertise": "Machine Learning",
                    "python": "Python",
                };
                const normalizedSkill = skillMap[skill.toLowerCase()] || skill;
                result.parameters.skill = normalizedSkill;
            }

            // Date normalization
            if (result.parameters.date) {
                let dateStr = String(result.parameters.date).toLowerCase().trim();
                let parsedDate: Date | null = null;
                if (dateStr === "next day" || dateStr === "tomorrow") {
                    parsedDate = new Date();
                    parsedDate.setDate(parsedDate.getDate() + 1);
                } else if (dateStr === "today") {
                    parsedDate = new Date();
                } else if (dateStr === "day after tomorrow") {
                    parsedDate = new Date();
                    parsedDate.setDate(parsedDate.getDate() + 2);
                } else {
                    parsedDate = new Date(result.parameters.date);
                }
                if (!isNaN(parsedDate.getTime())) {
                    const yyyy = parsedDate.getFullYear();
                    const mm = String(parsedDate.getMonth() + 1).padStart(2, '0');
                    const dd = String(parsedDate.getDate()).padStart(2, '0');
                    result.parameters.date = `${yyyy}-${mm}-${dd}`;
                } else {
                    delete result.parameters.date;
                }
            }
        }

        // Ensure parameters is always an object
        if (typeof result.parameters !== 'object' || result.parameters === null) {
            result.parameters = {};
        }

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

/**
 * Clean AI response by removing <think>...</think> blocks
 */
function cleanAIResponse(aiResponse: string): string {
    // Remove <think>...</think> blocks
    return aiResponse.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}
