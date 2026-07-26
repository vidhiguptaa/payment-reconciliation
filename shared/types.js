"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProcessingStatus = exports.MatchType = exports.MatchStatus = void 0;
var MatchStatus;
(function (MatchStatus) {
    MatchStatus["MATCHED"] = "Matched";
    MatchStatus["POSSIBLE_MATCH"] = "Possible Match";
    MatchStatus["NEEDS_REVIEW"] = "Needs Review";
    MatchStatus["UNMATCHED"] = "Unmatched";
})(MatchStatus || (exports.MatchStatus = MatchStatus = {}));
var MatchType;
(function (MatchType) {
    MatchType["AUTO_MATCHED"] = "AUTO_MATCHED";
    MatchType["MANUALLY_MATCHED"] = "MANUALLY_MATCHED";
})(MatchType || (exports.MatchType = MatchType = {}));
var ProcessingStatus;
(function (ProcessingStatus) {
    ProcessingStatus["PENDING"] = "PENDING";
    ProcessingStatus["PROCESSING"] = "PROCESSING";
    ProcessingStatus["PROCESSED"] = "PROCESSED";
    ProcessingStatus["FAILED"] = "FAILED";
})(ProcessingStatus || (exports.ProcessingStatus = ProcessingStatus = {}));
