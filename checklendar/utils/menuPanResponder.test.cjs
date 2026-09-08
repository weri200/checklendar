// Run: node --test utils/menuPanResponder.test.cjs
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');
const ts = require('typescript');

// Exercise the actual gesture callbacks without a native UI or extra test dependencies.
const exportsObject = {};
runInNewContext(ts.transpileModule(readFileSync(join(__dirname, 'menuPanResponder.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, {
  exports: exportsObject,
  require: () => ({
    PanResponder: { create: callbacks => callbacks },
    Animated: {
      timing: (value, { toValue }) => ({ start: () => value.setValue(toValue) }),
      parallel: animations => ({ start: () => animations.forEach(animation => animation.start()) }),
    },
  }),
});

test('menu handle follows dragging, dismisses deliberate swipes, and restores cancelled gestures', () => {
  const value = initial => ({
    current: initial,
    setValue(next) { this.current = next; },
    stopAnimation(callback) { callback?.(this.current); },
  });
  const panelBottom = value(0);
  const overlayOpacity = value(1);
  const isClosing = { current: false };
  let closed = 0;
  const handlers = exportsObject.createMenuPanResponder({
    panelBottom, overlayOpacity, panelHeight: { current: 400 }, isClosing,
    onClose: () => { closed += 1; },
  });
  const begin = () => handlers.onPanResponderGrant();
  const move = dy => handlers.onPanResponderMove(null, { dy });
  const release = (dy, vy = 0) => handlers.onPanResponderRelease(null, { dy, vy });

  assert.equal(handlers.onStartShouldSetPanResponder(), true);
  begin();
  move(40);
  assert.equal(panelBottom.current, -40);
  assert.equal(overlayOpacity.current, 0.9);
  release(40);
  assert.equal(closed, 0);
  assert.equal(panelBottom.current, 0);
  assert.equal(overlayOpacity.current, 1);

  begin();
  release(60);
  begin();
  release(20, 0.8);
  assert.equal(closed, 2);
  release(5, 2); // A tiny accidental movement must not dismiss the menu.
  release(-70, -1);
  assert.equal(closed, 2);

  panelBottom.setValue(-25); // Grab during the opening or restore animation.
  begin();
  move(15);
  assert.equal(panelBottom.current, -40);
  move(-100);
  assert.ok(panelBottom.current === 0);
  move(800);
  assert.equal(panelBottom.current, -400);
  assert.equal(overlayOpacity.current, 0);
  handlers.onPanResponderTerminate();
  assert.equal(panelBottom.current, 0);
  assert.equal(overlayOpacity.current, 1);

  isClosing.current = true;
  assert.equal(handlers.onStartShouldSetPanResponder(), false);
  panelBottom.setValue(-80);
  move(100);
  release(100);
  handlers.onPanResponderTerminate();
  assert.equal(panelBottom.current, -80);
  assert.equal(closed, 2);
});
