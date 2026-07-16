import type { ScoreDetail } from '../types';
import { scoreBg, scoreColor } from '../types';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

interface Props {
  label: string;
  weight: number;
  detail: ScoreDetail | undefined;
}

export function ScoreCard({ label, weight, detail }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (!detail) return null;
  const { score, rationale, jd_evidence, resume_evidence, missing, confidence } = detail;

  return (
    <div className={`border rounded-lg p-4 ${scoreBg(score)}`}>
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
          <p className="text-xs text-gray-400">{weight}% weight</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-3xl font-bold ${scoreColor(score)}`}>{score}</span>
          <span className="text-gray-400 text-sm">/10</span>
          {expanded ? (
            <ChevronUp size={16} className="text-gray-400" />
          ) : (
            <ChevronDown size={16} className="text-gray-400" />
          )}
        </div>
      </div>

      {expanded && (
        <div className="mt-4 space-y-3 text-sm">
          <div>
            <p className="font-medium text-gray-700">Rationale</p>
            <p className="text-gray-600 mt-0.5">{rationale}</p>
          </div>
          <div>
            <p className="font-medium text-gray-700">From Job Description</p>
            <p className="text-gray-600 mt-0.5 italic">&ldquo;{jd_evidence}&rdquo;</p>
          </div>
          <div>
            <p className="font-medium text-gray-700">From Resume</p>
            <p className="text-gray-600 mt-0.5 italic">&ldquo;{resume_evidence}&rdquo;</p>
          </div>
          {missing && missing !== 'None identified' && (
            <div>
              <p className="font-medium text-gray-700">Gaps</p>
              <p className="text-gray-600 mt-0.5">{missing}</p>
            </div>
          )}
          <div className="flex items-center gap-1">
            <span className="text-gray-500">Confidence:</span>
            <span
              className={`font-medium ${
                confidence === 'high'
                  ? 'text-green-600'
                  : confidence === 'medium'
                  ? 'text-yellow-600'
                  : 'text-red-500'
              }`}
            >
              {confidence}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
