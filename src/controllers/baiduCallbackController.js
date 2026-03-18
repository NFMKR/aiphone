const { enqueueTaskCall } = require("../services/baiduCallbackQueue");

function badRequest(response, msg) {
  return response.status(400).json({ code: 400, msg });
}

function toInt(value) {
  if (value === null || value === undefined) return null;
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) ? n : null;
}

function requiredString(obj, key) {
  const v = obj?.[key];
  if (typeof v !== "string" || v.trim() === "") return null;
  return v;
}

function requiredNumberLike(obj, key) {
  const v = obj?.[key];
  const n = toInt(v);
  if (n === null) return null;
  return n;
}

/**
 * 百度客悦：任务单通电话回调（callbackType=0）
 * 文档：`https://cloud.baidu.com/doc/ky/s/jmfnjplck`
 */
async function handleTaskCallCallback(request, response) {
  const body = request.body;
  const callbackType = requiredNumberLike(body, "callbackType");
  if (callbackType !== 0) {
    return badRequest(response, "callbackType 必须为 0");
  }

  const data = body?.data;
  if (!data || typeof data !== "object") {
    return badRequest(response, "data 必须为 object");
  }

  const sessionId = requiredString(data, "sessionId");
  const taskId = requiredString(data, "taskId");
  const taskName = requiredString(data, "taskName") || "";
  const robotId = requiredString(data, "robotId") || "";
  const robotName = requiredString(data, "robotName") || "";
  const mobile = requiredString(data, "mobile") || "";

  const tenantId = requiredNumberLike(data, "tenantId");
  const memberId = requiredNumberLike(data, "memberId");
  const endType = requiredNumberLike(data, "endType");

  if (!sessionId) return badRequest(response, "data.sessionId 必填");
  if (!tenantId) return badRequest(response, "data.tenantId 必填");
  if (!taskId) return badRequest(response, "data.taskId 必填");
  if (!memberId) return badRequest(response, "data.memberId 必填");
  if (endType === null) return badRequest(response, "data.endType 必填");

  enqueueTaskCall({
    callbackType,
    sessionId,
    tenantId,
    taskId,
    taskName,
    robotId,
    robotName,
    memberId,
    mobile,
    endType,
    receivedAt: new Date(),
    raw: body,
  });

  return response.status(200).json({
    code: 200,
    msg: "success",
    data: { memberId },
  });
}

module.exports = {
  handleTaskCallCallback,
};

