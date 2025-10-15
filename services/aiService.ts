import { Groq } from 'groq-sdk';

const groq = new Groq({
    apiKey: process.env.GROK_API_KEY,
});

export default async function AIRequest(prompt: string) {
    let result = '';

    const chatCompletion = await groq.chat.completions.create({
        messages: [
            {
                role: 'user',
                content: prompt,
            },
        ],
        model: 'openai/gpt-oss-120b',
        temperature: 1,
        max_completion_tokens: 8192,
        top_p: 1,
        stream: true,
        reasoning_effort: 'medium',
        stop: null,
    });

    // Collect chunks into a single string
    for await (const chunk of chatCompletion) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
            result += content;
        }
    }

    return result.trim();
}
