// tests/greet.test.js
const assert = require('assert');
const { greet } = require('../src/utils/greet');

function test_greet_basic() {
  assert.strictEqual(greet('Nex'), 'Hello, Nex!');
  assert.strictEqual(greet(''), 'Hello, world!');
  assert.strictEqual(greet(null), 'Hello, world!');
}

try {
  test_greet_basic();
  console.log('✓ greet tests passed');
} catch (err) {
  console.error('✗ greet tests failed:', err.message);
  process.exit(1);
}
