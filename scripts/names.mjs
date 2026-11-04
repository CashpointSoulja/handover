// The names the scans look for: coding tools, assistants, model vendors and model families.
// Stored reversed so this file does not match itself.
const reversed = [
  'edualc', 'ciporhtna', 'ianepo', 'tpgtahc', 'xedoc', 'nived', 'rosruc', 'tolipoc', 'inimeg',
  'frusdniw', 'lartsim', 'amall', 'ytixelprep', 'keespeed', 'eninbat', 'tilper', 'elbavol', 'derohtua-oc',
];
const reversedWords = ['supo', 'tennos', 'ukiah', 'tpg', 'redia', 'korg', 'drab'];
const rev = (s) => s.split('').reverse().join('');

/** Case-insensitive pattern: substrings for distinctive names, whole words for short ones. */
export const NAME_PATTERN = new RegExp(
  `(${reversed.map(rev).join('|')})|\\b(${reversedWords.map(rev).join('|')})\\b`,
  'i',
);
