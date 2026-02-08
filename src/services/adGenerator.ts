import { toast } from "sonner";

const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;

interface CampaignRequest {
    brandName: string;
    industry: string;
    theme: string;
    headlineText: string;
    visualStyle: string;
    brandColor: string;
    productImageBase64?: string;
    productImageMimeType?: string;
}

export const generateCampaign = async (params: CampaignRequest) => {
    if (!OPENROUTER_API_KEY) {
        throw new Error("API configuration missing. Please add VITE_OPENROUTER_API_KEY to .env");
    }

    const {
        brandName,
        industry,
        theme,
        headlineText,
        visualStyle,
        brandColor,
        productImageBase64,
        productImageMimeType,
    } = params;

    // ============================
    // STEP 1: Analyze product image (if provided)
    // ============================
    let productContext = "";

    if (productImageBase64 && productImageMimeType) {
        console.log("Step 1: Analyzing product image with vision...");

        const visionMessages = [
            {
                role: "user",
                content: [
                    {
                        type: "text",
                        text: `You are an expert product analyst. Analyze this product image in detail. Describe the product, its colors, textures, materials, shape, and any notable features. Be specific and vivid so a text-to-image AI can recreate this product accurately in a new scene. Keep your description to 3-4 sentences.`,
                    },
                    {
                        type: "image_url",
                        image_url: {
                            url: `data:${productImageMimeType};base64,${productImageBase64}`,
                        },
                    },
                ],
            },
        ];

        try {
            const visionResp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${OPENROUTER_API_KEY}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": window.location.origin,
                    "X-Title": "AI Ad Studio",
                },
                body: JSON.stringify({
                    model: "anthropic/claude-3.5-sonnet",
                    messages: visionMessages,
                    max_tokens: 500,
                }),
            });

            if (!visionResp.ok) {
                const error = await visionResp.text();
                console.error("Vision failed:", error);
            } else {
                const visionData = await visionResp.json();
                productContext = visionData.choices?.[0]?.message?.content || "";
            }
        } catch (e) {
            console.error("Vision error:", e);
        }
    }

    // ============================
    // STEP 2: Engineer a detailed prompt for image generation
    // ============================
    console.log("Step 2: Engineering prompt...");

    const styleDescriptions: Record<string, string> = {
        Photorealistic: "photorealistic, high-end commercial photography, studio lighting, sharp details, professional product shot",
        Neon: "neon lights, dark moody atmosphere, vibrant glowing colors, cyberpunk-inspired, futuristic",
        Pastel: "soft pastel colors, minimalist, clean, gentle gradients, calming aesthetic, modern",
        Luxury: "luxury, gold accents, rich textures, premium feel, elegant composition, dark sophisticated tones",
    };

    const styleDesc = styleDescriptions[visualStyle] || styleDescriptions.Photorealistic;

    const productSection = productContext
        ? `\n\nIMPORTANT PRODUCT CONTEXT (from analyzing the uploaded product photo):\n${productContext}\nYou MUST incorporate this exact product into the scene naturally.`
        : "";

    const promptEngineerMessages = [
        {
            role: "system",
            content: `You are a world-class Advertising Creative Director and Expert Prompt Engineer. 

Your primary mission is to take the "Main Offer/Headline" provided and design a visual composition where this offer is the absolute HERO.

CRITICAL FOCUS: The text "${headlineText}" MUST be integrated into the image with peak legibility and stunning typography. It should not look like an afterthought; it should be part of the scene (e.g., floating 3D text, neon sign, elegant overlay, or integrated into the set design).

The image MUST include:
1. The EXACT text "${headlineText}" (NO typos, NO variations)
2. Visual style: ${styleDesc} (Premium and high-end)
3. Brand color ${brandColor} used strategically to make the offer pop
4. A scene optimized for a ${theme}-themed ${industry} campaign for "${brandName}"

RULES for the generated prompt:
- Describe the TYPOGRAPHY specifically (font style, weight, material, lighting on the letters).
- Describe the PLACEMENT (center, top-third, or dynamic perspective).
- Describe the LIGHTING that makes the text readable (rim lighting, shadows for depth).
- Output ONLY the final image generation prompt. No conversational text.`,
        },
        {
            role: "user",
            content: `Analyze this offer: "${headlineText}"
Product details: ${productSection || "General " + industry + " product"}
Brand: ${brandName}
Style goal: ${visualStyle}

Create a prompt that makes the offer "${headlineText}" look like a professional, high-budget advertisement.`,
        },
    ];

    const promptResp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": window.location.origin,
            "X-Title": "AI Ad Studio",
        },
        body: JSON.stringify({
            model: "anthropic/claude-3.5-sonnet",
            messages: promptEngineerMessages,
            max_tokens: 500,
        }),
    });

    if (!promptResp.ok) {
        const errorText = await promptResp.text();
        console.error("Prompt Engineering Error:", errorText);
        throw new Error(`Prompt engineering failed: ${promptResp.status}`);
    }

    const promptData = await promptResp.json();
    const imagenPrompt = promptData.choices?.[0]?.message?.content?.trim();

    if (!imagenPrompt) throw new Error("Failed to generate prompt");

    console.log("Generated prompt:", imagenPrompt);

    // ============================
    // STEP 3: Generate high-quality image with Gemini 2.5 Flash
    // ============================
    console.log("Step 3: Generating high-quality image with Gemini 2.5 Flash...");

    const imageGenResp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": window.location.origin,
            "X-Title": "AI Ad Studio",
        },
        body: JSON.stringify({
            model: "google/gemini-2.5-flash-image",
            messages: [
                {
                    role: "user",
                    content: imagenPrompt
                }
            ],
            modalities: ["image"]
        }),
    });

    if (!imageGenResp.ok) {
        const errorText = await imageGenResp.text();
        console.error("Image Gen Error:", errorText);
        throw new Error(`Image generation failed: ${imageGenResp.status} - ${errorText}`);
    }

    const imageGenData = await imageGenResp.json();
    console.log("Full Image response:", JSON.stringify(imageGenData, null, 2));

    // Robust extraction for Flux/OpenRouter response structure
    let finalImageUrl = "";

    // 1. Check for standard multimodal structure
    const message = imageGenData.choices?.[0]?.message;
    if (message?.content) {
        if (Array.isArray(message.content)) {
            const imagePart = message.content.find((part: any) => part.type === "image" || part.image_url);
            finalImageUrl = imagePart?.image_url?.url || imagePart?.url;
        } else if (typeof message.content === 'string' && message.content.startsWith('http')) {
            finalImageUrl = message.content;
        }
    }

    // 2. Fallback: Recursive search for any URL in the object
    if (!finalImageUrl) {
        const findImageUrl = (obj: any): string | null => {
            if (!obj || typeof obj !== 'object') return null;
            if (typeof obj.url === 'string' && (obj.url.startsWith('http') || obj.url.startsWith('data:'))) return obj.url;
            if (typeof obj.image_url?.url === 'string') return obj.image_url.url;

            for (const key in obj) {
                const result = findImageUrl(obj[key]);
                if (result) return result;
            }
            return null;
        };
        finalImageUrl = findImageUrl(imageGenData) || "";
    }

    if (!finalImageUrl) {
        console.error("No image URL found in response:", JSON.stringify(imageGenData, null, 2));
        throw new Error("The image was generated but the URL could not be extracted. Please check the console.");
    }

    console.log("Extracted image URL:", finalImageUrl);

    // ============================
    // STEP 4: Generate compelling caption
    // ============================
    console.log("Step 4: Generating caption...");

    const captionMessages = [
        {
            role: "system",
            content: `You are an expert social media copywriter. Generate a compelling social media caption for a marketing post.

The caption should:
1. Be engaging, on-brand, and conversion-focused
2. Include 2-3 relevant hashtags at the end
3. Be between 50-150 words
4. Match the tone of the campaign theme
5. Include a clear, actionable call to action
6. Create urgency or excitement

Output ONLY the caption text, nothing else.`,
        },
        {
            role: "user",
            content: `Brand: ${brandName}
Industry: ${industry}
Theme/Occasion: ${theme}
Main Headline: "${headlineText}"
Visual Style: ${visualStyle}

Write a matching social media caption that will drive engagement.`,
        },
    ];

    const captionResp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": window.location.origin,
            "X-Title": "AI Ad Studio",
        },
        body: JSON.stringify({
            model: "anthropic/claude-3.5-sonnet",
            messages: captionMessages,
            max_tokens: 300,
        }),
    });

    let caption = "";
    if (captionResp.ok) {
        const captionData = await captionResp.json();
        caption = captionData.choices?.[0]?.message?.content?.trim() || "";
    } else {
        const errorText = await captionResp.text();
        console.error("Caption Generation Error:", errorText);
    }

    return { imageUrl: finalImageUrl, caption, prompt: imagenPrompt };
};
