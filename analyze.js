// /api/analyze.js
// 옷 사진을 받아 Claude에게 분석시키고, 리폼 아이디어 JSON을 반환합니다.
// ANTHROPIC_API_KEY는 Vercel 환경변수에서 읽어오며, 브라우저에는 절대 노출되지 않습니다.

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST 요청만 허용돼요.' });
    return;
  }

  const { image, mediaType } = req.body || {};
  if (!image || !mediaType) {
    res.status(400).json({ error: '이미지 데이터가 없어요.' });
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: '서버에 ANTHROPIC_API_KEY가 설정되지 않았어요.' });
    return;
  }

  const systemPrompt = `너는 업사이클링/리폼 전문가야. 옷 사진을 보고 실제로 만들 수 있는 리폼 아이디어를 제안해.
반드시 아래 JSON 형식으로만 응답해. 다른 설명, 코드블록 표시(백틱) 없이 순수 JSON 텍스트만 출력해.

{
  "garment_type": "옷의 종류 (예: 데님 청바지)",
  "condition": "상태에 대한 한 줄 설명 (예: 무릎 부분이 헤졌지만 원단은 튼튼함)",
  "estimated_fabric": "추정 원단 (예: 코튼 데님으로 추정)",
  "ideas": [
    {
      "title": "리폼 결과물 이름",
      "difficulty": "쉬움 | 보통 | 어려움 중 하나",
      "materials": "필요한 추가 재료나 도구",
      "description": "왜 이 옷으로 이게 가능한지 1~2문장 설명",
      "steps": ["짧은 동작 단계 1 (5글자 내외)", "단계 2", "단계 3", "단계 4(선택)"],
      "search_query": "이 리폼 결과물과 비슷한 사진을 찾기 위한 한국어 검색어 (예: 청바지 반바지 리폼)",
      "pinterest_pins": ["실제로 검색해서 찾은 핀터레스트 핀 URL (예: https://www.pinterest.com/pin/1234567890/)"]
    }
  ]
}

ideas는 정확히 3개를 제공하고, 현재 사진 속 옷의 실제 원단 양과 형태로 실현 가능한 것만 제안해. 난이도는 하나 이상 서로 다르게 섞어서 제안해. steps는 실제 작업 순서를 짧고 명확한 동사구로 작성해 (예: "밑단 표시하기", "가위로 자르기", "가장자리 박음질").

pinterest_pins는 웹 검색 도구를 사용해서 "site:pinterest.com {search_query}" 형태로 실제 검색한 다음, 검색 결과에 실제로 나온 핀터레스트 핀 URL만 최대 3개까지 넣어. 검색 결과가 없거나 확실하지 않으면 절대 URL을 지어내지 말고 빈 배열로 남겨. 모든 아이디어에 대해 검색을 마친 후, 최종 답변은 다른 설명 없이 순수 JSON 하나만 출력해.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
              { type: 'text', text: '이 옷 사진을 분석하고, 각 아이디어마다 핀터레스트에서 실제 사례를 검색한 다음, 최종 결과를 JSON으로만 응답해줘.' }
            ]
          }
        ],
        tools: [{ type: 'web_search_20250305', name: 'web_search' }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic API error:', errText);
      res.status(502).json({ error: '분석 API 호출에 실패했어요.' });
      return;
    }

    const data = await response.json();
    const textBlocks = (data.content || []).filter((b) => b.type === 'text');
    if (!textBlocks.length) {
      res.status(502).json({ error: '분석 결과를 받지 못했어요.' });
      return;
    }

    const finalText = textBlocks[textBlocks.length - 1].text;
    const cleaned = finalText.replace(/```json|```/g, '').trim();
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');

    if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
      console.error('No JSON object found. Raw text:', finalText);
      res.status(502).json({ error: '결과를 해석하는 데 문제가 생겼어요.' });
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    } catch (e) {
      console.error('JSON parse failed. Raw text:', finalText);
      res.status(502).json({ error: '결과를 해석하는 데 문제가 생겼어요.' });
      return;
    }

    res.status(200).json(parsed);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버에서 문제가 생겼어요.' });
  }
};
