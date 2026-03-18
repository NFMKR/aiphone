const { generateAndStoreSummary, getSummariesByMobile } = require("../services/baiduSummaryService");

async function generateSummaryForSession(request, response) {
  const sessionId = request.params.sessionId;
  try {
    const result = await generateAndStoreSummary(sessionId);
    response.status(200).json({ ok: true, sessionId, summary: result.summaryJson });
  } catch (error) {
    response.status(500).json({ ok: false, sessionId, message: error.message });
  }
}

async function getSummariesForMobile(request, response) {
  const mobile = request.params.mobile;
  const { take, skip, beforeId } = request.query;

  if (!mobile || typeof mobile !== "string") {
    return response.status(400).json({ ok: false, message: "mobile 必填" });
  }

  try {
    const rows = await getSummariesByMobile({ mobile, take, skip, beforeId });
    return response.status(200).json({
      ok: true,
      mobile,
      count: rows.length,
      items: rows.map((r) => ({
        id: r.id,
        sessionId: r.session_id,
        mobile: r.mobile,
        summaryJson: r.summary_json,
        model: r.model,
        promptVersion: r.prompt_version,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        facts: {
          tenantId: r.tenant_id,
          memberId: r.member_id,
          talkingTimeLen: r.talking_time_len,
          endType: r.end_type,
          startTime: r.start_time,
          endTime: r.end_time,
        },
      })),
      nextCursor: rows.length > 0 ? rows[rows.length - 1].id : null,
    });
  } catch (error) {
    return response.status(500).json({ ok: false, message: error.message });
  }
}

module.exports = {
  generateSummaryForSession,
  getSummariesForMobile,
};

