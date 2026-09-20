import { describe, it, expect } from 'vitest';
import { telegramShareUrl, quizBragText, plannerInviteText, shareUrl } from './share';

describe('telegram sharing helpers', () => {
  it('builds a t.me share link with encoded text + url', () => {
    const link = telegramShareUrl('Can you beat me?', 'https://smartstudy.pro.et/practice');
    expect(link.startsWith('https://t.me/share/url?')).toBe(true);
    const params = new URLSearchParams(link.split('?')[1]);
    expect(params.get('text')).toBe('Can you beat me?');
    expect(params.get('url')).toBe('https://smartstudy.pro.et/practice');
  });

  it('brags with score, percentage, grade and subject', () => {
    expect(
      quizBragText({ score: 8, total: 10, subject: 'Biology', grade: '10' })
    ).toBe(
      'I scored 8/10 (80%) in Grade 10 Biology practice on SmartStudy — can you beat me? Try it free:'
    );
  });

  it('never emits NaN% on an empty quiz', () => {
    expect(
      quizBragText({ score: 0, total: 0, subject: 'Mathematics', grade: '9' })
    ).toContain('(0%)');
  });

  it('planner invite links back to the product', () => {
    expect(plannerInviteText()).toContain('SmartStudy');
    expect(shareUrl('/planner')).toContain('/planner');
  });
});
