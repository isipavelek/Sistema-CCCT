const LOCAL_GEMINI_API_KEY = "AIzaSyBEoUIVW-MV19Lz2_HPLQT478GwHhf3HnA";

export const callGemini = async (prompt) => {
    const apiKey = typeof __firebase_config === 'undefined' ? LOCAL_GEMINI_API_KEY : "";
    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }]
                })
            }
        );
        if (!response.ok) throw new Error('API Error');
        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || "No se pudo generar respuesta.";
    } catch (error) {
        console.error("Gemini Error:", error);
        return "Hubo un error al conectar con la IA.";
    }
};
