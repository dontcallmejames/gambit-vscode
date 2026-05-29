import { render, h } from 'preact';
import { App } from './App.js';
import tokens from './tokens.css';
import css from './styles.css';

// esbuild's text loader gives us the CSS as a string. Inject tokens first so the
// --veyra-* design tokens are defined before styles.css consumes them.
const style = document.createElement('style');
style.textContent = `${tokens}\n${css}`;
document.head.appendChild(style);

const root = document.getElementById('root');
if (root) {
  render(h(App, {}), root);
}
