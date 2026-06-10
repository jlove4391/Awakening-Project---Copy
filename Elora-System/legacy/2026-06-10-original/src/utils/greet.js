// src/utils/greet.js
function greet(name) {
  const n = (name ?? '').toString().trim() || 'world';
  return `Hello, ${n}!`;
}
module.exports = { greet };
