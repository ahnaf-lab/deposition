export { parseDiff } from "./diffParser.js";
export {
  parseTranscript,
  extractClaims,
  extractNarrationClaims,
} from "./transcriptParser.js";
export {
  findUntouchedFileClaims,
  findUnsupportedTestsPassClaims,
  generateObjections,
} from "./objections.js";
export { renderDeposition, buildExhibits, tallyVerdicts } from "./template.js";
