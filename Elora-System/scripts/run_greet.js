// scripts/run_greet.js
const { greet } = require('../src/utils/greet');

const name = process.argv.slice(2).join(' ') || 'world';
console.log(greet(name));
