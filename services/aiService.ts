import axios from "axios";

const OLLAMA_URL = "http://localhost:11434/api/generate";
const MODEL_NAME = "deepseek-r1:1.5b";

export default async function callOllama(prompt: string, maxTokens = 500) {
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
