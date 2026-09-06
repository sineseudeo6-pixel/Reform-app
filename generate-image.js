// /api/generate-image.js
// 원본 옷 사진 + 리폼 아이디어를 받아 Gemini 이미지 모델로 예상 이미지를 생성합니다.
// GEMINI_API_KEY는 Vercel 환경변수에서 읽어오며, 브라우저에는 절대 노출되지 않습니다.

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST 요청만 허용돼요.' });
    return;
  }

  const { image, mediaType, title, description } = req.body || {};
  if (!image || !mediaType) {
    res.status(400).json({ error: '이미지 데이터가 없어요.' });
    return;
  }

  if (!process.env.GEMINI_API_KEY) {
    res.status(500).json({ error: '서버에 GEMINI_API_KEY가 설정되지 않았어요.' });
    return;
  }

  const prompt = `이 옷 사진을 참고해서, 옷의 원단 질감과 색상은 최대한 유지하면서 다음 리폼 아이디어를 적용했을 때의 모습을 사실적인 사진으로 생성해줘.
리폼 아이디어: ${title || ''}
설명: ${description || ''}
결과물만 깔끔한 배경 위에 놓인 제품 사진처럼 보여줘.`;

  try {
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { inlineData: { mimeType: mediaType, data: image } },
                { text: prompt }
              ]
            }
          ],
          generationConfig: {
            responseModalities: ['TEXT', 'IMAGE'],
            imageConfig: { aspectRatio: '1:1' }
          }
        })
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini API error:', errText);
      res.status(502).json({ error: '이미지 생성에 실패했어요.' });
      return;
    }

    const data = await response.json();
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find((p) => p.inlineData && p.inlineData.data);

    if (!imagePart) {
      res.status(502).json({ error: '생성된 이미지를 받지 못했어요.' });
      return;
    }

    res.status(200).json({
      imageDataUrl: `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버에서 문제가 생겼어요.' });
  }
};
