"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MODEL_IDS = void 0;
exports.ldField = ldField;
exports.frame = frame;
exports.buildMetadata = buildMetadata;
exports.encodeVarint = encodeVarint;
exports.buildSafetyConfig = buildSafetyConfig;
function ldField(tag, data) {
    const tagByte = (tag << 3) | 2;
    const body = typeof data === "string" ? Buffer.from(data) : data;
    const len = body.length;
    const lenBytes = [];
    if (len < 128) {
        lenBytes.push(len);
    }
    else if (len < 16384) {
        lenBytes.push((len & 0x7f) | 0x80);
        lenBytes.push(len >> 7);
    }
    else {
        let remaining = len;
        while (remaining >= 128) {
            lenBytes.push((remaining & 0x7f) | 0x80);
            remaining >>= 7;
        }
        lenBytes.push(remaining);
    }
    return Buffer.concat([Buffer.from([tagByte]), Buffer.from(lenBytes), body]);
}
function frame(data, isEndOfStream = false) {
    const header = Buffer.alloc(5);
    header.writeUInt8(isEndOfStream ? 0x02 : 0x00, 0);
    header.writeUInt32BE(data.length, 1);
    return Buffer.concat([header, data]);
}
function buildMetadata(oauthToken, extensionVersion = "1.14.2") {
    return Buffer.concat([
        ldField(1, "antigravity"),
        ldField(3, oauthToken),
        ldField(4, "en"),
        ldField(7, extensionVersion),
        ldField(12, "antigravity"),
    ]);
}
exports.MODEL_IDS = {
    "Gemini 3.1 Pro (High)": 1037,
    "Gemini 3.1 Pro (Low)": 1036,
    "Gemini 3 Flash": 1018,
    "Claude Sonnet 4.6 (Thinking)": 1035,
    "Claude Opus 4.6 (Thinking)": 1026,
    "GPT-OSS 120B (Medium)": 342,
};
// Model placeholder string mapping (for JSON API mode)
exports.MODEL_PLACEHOLDER_IDS = {
    "Gemini 3.1 Pro (High)": "MODEL_PLACEHOLDER_M37",
    "Gemini 3.1 Pro (Low)": "MODEL_PLACEHOLDER_M36",
    "Gemini 3 Flash": "MODEL_PLACEHOLDER_M18",
    "Claude Sonnet 4.6 (Thinking)": "MODEL_PLACEHOLDER_M35",
    "Claude Opus 4.6 (Thinking)": "MODEL_PLACEHOLDER_M26",
    "GPT-OSS 120B (Medium)": "MODEL_OPENAI_GPT_OSS_120B_MEDIUM",
};
function encodeVarint(value) {
    const bytes = [];
    while (value > 0x7f) {
        bytes.push((value & 0x7f) | 0x80);
        value >>= 7;
    }
    bytes.push(value & 0x7f);
    return Buffer.from(bytes);
}
function buildSafetyConfig(modelName) {
    const modelId = exports.MODEL_IDS[modelName] || exports.MODEL_IDS["Gemini 3 Flash"];
    const modelIdVarint = encodeVarint(modelId);
    const modelField = Buffer.concat([
        Buffer.from([0x08]),
        modelIdVarint,
    ]);
    const field15 = Buffer.concat([
        Buffer.from([0x7a]),
        Buffer.from([modelField.length]),
        modelField,
    ]);
    const beforeModel = Buffer.from("0a631204200170006a4c42451a43120275761a07676974206164641a096769742073746173681a096769742072657365741a0c67697420636865636b6f75741a09707974686f6e202d631a0370697030038a02020801", "hex");
    const afterModel = Buffer.from("aa0102080182020208013a0208015801", "hex");
    const innerContent = Buffer.concat([beforeModel, field15, afterModel]);
    return Buffer.concat([
        Buffer.from([0x2a]),
        encodeVarint(innerContent.length),
        innerContent,
    ]);
}
//# sourceMappingURL=protobuf.js.map