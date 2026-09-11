import React from 'react';

export type PasswordStrengthLevel = 'weak' | 'medium' | 'strong';

export interface PasswordCheck {
  label: string;
  met: boolean;
}

// Single source of truth for password strength (used by register + reset).
// weak = 2 or fewer rules met; medium = 3-4; strong = all 5.
export const getPasswordStrength = (pwd: string): {
  strength: PasswordStrengthLevel;
  score: number;
  checks: PasswordCheck[];
} => {
  const checks = [
    { label: 'At least 8 characters', met: pwd.length >= 8 },
    { label: 'Contains uppercase letter', met: /[A-Z]/.test(pwd) },
    { label: 'Contains lowercase letter', met: /[a-z]/.test(pwd) },
    { label: 'Contains number', met: /[0-9]/.test(pwd) },
    { label: 'Contains special character', met: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd) },
  ];

  const metCount = checks.filter(c => c.met).length;
  let strength: PasswordStrengthLevel = 'weak';
  if (metCount > 4) strength = 'strong';
  else if (metCount > 2) strength = 'medium';

  return { strength, score: metCount, checks };
};

export const PasswordStrengthMeter: React.FC<{ password: string }> = ({ password }) => {
  if (!password) return null;
  const strength = getPasswordStrength(password);
  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-zinc-200 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              strength.strength === 'weak'
                ? 'bg-red-500 w-1/3'
                : strength.strength === 'medium'
                ? 'bg-amber-500 w-2/3'
                : 'bg-emerald-500 w-full'
            }`}
          />
        </div>
        <span
          className={`text-xs font-medium ${
            strength.strength === 'weak'
              ? 'text-red-600'
              : strength.strength === 'medium'
              ? 'text-amber-600'
              : 'text-emerald-600'
          }`}
        >
          {strength.strength === 'weak' ? 'Weak' : strength.strength === 'medium' ? 'Medium' : 'Strong'}
        </span>
      </div>
      <div className="space-y-1">
        {strength.checks.map((check, idx) => (
          <div key={idx} className="flex items-center gap-2 text-xs">
            <div
              className={`w-3 h-3 rounded-full flex items-center justify-center flex-shrink-0 ${
                check.met ? 'bg-emerald-500' : 'bg-zinc-200'
              }`}
            >
              {check.met && (
                <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </div>
            <span className={check.met ? 'text-zinc-600' : 'text-zinc-400'}>
              {check.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
