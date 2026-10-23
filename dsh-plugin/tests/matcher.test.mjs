/**
 * Footnote/math-aware matcher unit tests (pure regex, no DOM).
 *
 * Guards the port of createFootnoteAwareMatcher: placeholder wildcards and
 * zero-width stripping are the two silent-failure modes for documents with
 * footnotes/formulas. Tests pass flags='' — the /g default is for exec loops
 * and its lastIndex state leaks between assertions.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createFootnoteAwareMatcher, stripZeroWidth } from '../src/client/correctionMatching.ts'

test('plain text escapes regex metacharacters', () => {
  const re = createFootnoteAwareMatcher('a.b*c (x)', '')
  assert.ok(re)
  assert.match('xx a.b*c (x) yy', re)
  const re2 = createFootnoteAwareMatcher('a.b*c', '')
  assert.ok(re2)
  assert.doesNotMatch('axbxc', re2)
})

test('footnote placeholder matches the rendered superscript digit', () => {
  // original from the engine carries [[FOOTNOTE_REF:0]]; DOM shows "文本1内容"
  const re = createFootnoteAwareMatcher('文本[[FOOTNOTE_REF:0]]内容', '')
  assert.ok(re)
  assert.match('前缀文本1内容后缀', re)
  assert.match('前缀文本内容后缀', re) // \d* tolerates a missing rendered digit
})

test('math placeholder matches MathML text including inner spaces', () => {
  const re = createFootnoteAwareMatcher('公式[[MATH:C = a/b]]结束', '')
  assert.ok(re)
  assert.match('公式C = a / b结束', re)
  assert.match('公式C结束', re)
})

test('zero-width chars never burn into the pattern', () => {
  assert.equal(stripZeroWidth('a\u200Bb\uFEFFc'), 'abc')
  const re = createFootnoteAwareMatcher('词\u200B组', '')
  assert.ok(re)
  assert.match('xx 词组 yy', re)
})

test('empty search yields no matcher; placeholder-only searches degrade to wildcards', () => {
  assert.equal(createFootnoteAwareMatcher(''), null)
  // '[[MATH:]]' splits into empty parts around one placeholder -> a bare wildcard
  // regex (truthy, matches anything). Engine originals always carry real text,
  // and locate guards empty originals, so this never escapes in practice.
  assert.ok(createFootnoteAwareMatcher('[[MATH:]]'))
})
