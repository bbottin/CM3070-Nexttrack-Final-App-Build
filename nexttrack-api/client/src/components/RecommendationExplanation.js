// client/src/components/RecommendationExplanation.js

import React from "react";

function RecommendationExplanation({ explanation }) {
  if (!explanation) return null;

  return (
    <div className="explanation-box">
      <div className="label">💡 Recommendation Explanation</div>
      <div className="reason">{explanation}</div>
    </div>
  );
}

export default RecommendationExplanation;
