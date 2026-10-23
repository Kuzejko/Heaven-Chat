const test = require('node:test');
const assert = require('node:assert');
const HeadlessBrowser = require('../helpers/browser.js');

// Helper to wrap test and handle browser lifetime
async function runWithBrowser(callback) {
  const browser = new HeadlessBrowser();
  await browser.connect();
  try {
    await browser.navigate('http://localhost:3000');
    await browser.evaluate("localStorage.clear()");
    await browser.navigate('http://localhost:3000');
    await callback(browser);
  } finally {
    if (browser.ws && browser.ws.readyState === WebSocket.OPEN) {
      browser.ws.close();
    }
  }
}

// ----------------------------------------------------------------------------
// REQUIREMENT 1: Glassmorphism & Dark Theme Boundaries
// ----------------------------------------------------------------------------

test('R1_T2_1: Verify font fallback when Google Fonts fail (block font URLs)', async () => {
  const browser = new HeadlessBrowser();
  await browser.connect();
  try {
    await browser.sendCommand('Network.enable');
    await browser.sendCommand('Network.setBlockedURLs', {
      urls: ['*fonts.googleapis.com*', '*fonts.gstatic.com*']
    });
    await browser.navigate('http://localhost:3000');
    
    // Check page load and title fallback functionality
    const title = await browser.evaluate(`
      (() => {
        return document.title;
      })()
    `);
    assert.strictEqual(title, 'Heaven Chat');
    
    const fontFamily = await browser.evaluate(`
      (() => {
        return window.getComputedStyle(document.body).fontFamily;
      })()
    `);
    assert.ok(fontFamily.includes('sans-serif'), 'Font family fallback sans-serif should be present');
  } finally {
    await browser.sendCommand('Network.setBlockedURLs', { urls: [] });
    if (browser.ws && browser.ws.readyState === WebSocket.OPEN) {
      browser.ws.close();
    }
  }
});

test('R1_T2_2: Verify distinct contrast styles between user/assistant message bubbles', async () => {
  await runWithBrowser(async (browser) => {
    const borderDiffers = await browser.evaluate(`
      (() => {
        const userBorder = window.getComputedStyle(document.documentElement).getPropertyValue('--bubble-user-border').trim();
        const assistantBorder = window.getComputedStyle(document.documentElement).getPropertyValue('--bubble-assistant-border').trim();
        return userBorder !== assistantBorder;
      })()
    `);
    assert.strictEqual(borderDiffers, true);
  });
});

test('R1_T2_3: Verify custom scrollbar styling definitions', async () => {
  await runWithBrowser(async (browser) => {
    const hasScrollbarRules = await browser.evaluate(`
      (() => {
        const rules = [...document.styleSheets].flatMap(s => {
          try { return [...s.cssRules]; } catch { return []; }
        });
        const hasScrollbar = rules.some(r => r.selectorText && r.selectorText.includes('::-webkit-scrollbar'));
        const hasTrack = rules.some(r => r.selectorText && r.selectorText.includes('::-webkit-scrollbar-track'));
        const hasThumb = rules.some(r => r.selectorText && r.selectorText.includes('::-webkit-scrollbar-thumb'));
        return JSON.stringify({ hasScrollbar, hasTrack, hasThumb });
      })()
    `);
    const { hasScrollbar, hasTrack, hasThumb } = JSON.parse(hasScrollbarRules);
    assert.strictEqual(hasScrollbar, true);
    assert.strictEqual(hasTrack, true);
    assert.strictEqual(hasThumb, true);
  });
});

test('R1_T2_4: Verify text contrast calculations against WCAG AA standards', async () => {
  await runWithBrowser(async (browser) => {
    const contrastRatio = await browser.evaluate(`
      (() => {
        function getLuminance(rgbStr) {
          const parts = rgbStr.match(/\\d+/g);
          if (!parts) return 0;
          const r = parseInt(parts[0]) / 255;
          const g = parseInt(parts[1]) / 255;
          const b = parseInt(parts[2]) / 255;
          const a = [r, g, b].map(v => {
            return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
          });
          return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
        }

        function getContrastRatio(color1, color2) {
          const l1 = getLuminance(color1);
          const l2 = getLuminance(color2);
          const lighter = Math.max(l1, l2);
          const darker = Math.min(l1, l2);
          return (lighter + 0.05) / (darker + 0.05);
        }

        const bodyStyle = window.getComputedStyle(document.body);
        const textColor = bodyStyle.color;
        const baseBgColor = 'rgb(5, 7, 10)'; // solid background fallback #05070a
        return getContrastRatio(textColor, baseBgColor);
      })()
    `);
    console.log('[test] Primary text contrast ratio:', contrastRatio);
    assert.ok(contrastRatio >= 4.5, `Contrast ratio (${contrastRatio}) should meet WCAG AA standard (>= 4.5)`);
  });
});

test('R1_T2_5: Verify fallback opacity when backdrop-filter is unsupported', async () => {
  await runWithBrowser(async (browser) => {
    const glassBgVal = await browser.evaluate(`
      (() => {
        return window.getComputedStyle(document.documentElement).getPropertyValue('--glass-bg').trim();
      })()
    `);
    assert.ok(glassBgVal.startsWith('rgba'), 'Should be an rgba color');
    const alpha = parseFloat(glassBgVal.split(',')[3]);
    assert.ok(alpha >= 0.3 && alpha <= 0.9, 'Alpha opacity should be a translucent fallback between 0.3 and 0.9');
  });
});


// ----------------------------------------------------------------------------
// REQUIREMENT 2: Layout Collapsible Panels Boundaries
// ----------------------------------------------------------------------------

test('R2_T2_1: Verify desktop to mobile dynamic viewport resizing layout adaptation', async () => {
  const browser = new HeadlessBrowser();
  await browser.connect();
  try {
    // 1. Desktop mode
    await browser.sendCommand('Emulation.setDeviceMetricsOverride', {
      width: 1024,
      height: 768,
      deviceScaleFactor: 1,
      mobile: false
    });
    await browser.navigate('http://localhost:3000');
    const isLeftSidebarVisibleDesktop = await browser.evaluate(`
      (() => {
        const sidebar = document.querySelector('#sidebarLeft');
        const style = window.getComputedStyle(sidebar);
        return style.display !== 'none' && sidebar.getBoundingClientRect().left === 0;
      })()
    `);
    assert.strictEqual(isLeftSidebarVisibleDesktop, true, 'Left sidebar should be visible on desktop');

    // 2. Mobile mode
    await browser.sendCommand('Emulation.setDeviceMetricsOverride', {
      width: 375,
      height: 812,
      deviceScaleFactor: 1,
      mobile: true
    });
    // Wait for resize events
    await new Promise(resolve => setTimeout(resolve, 300));
    const isLeftSidebarHiddenMobile = await browser.evaluate(`
      (() => {
        const sidebar = document.querySelector('#sidebarLeft');
        const rect = sidebar.getBoundingClientRect();
        return rect.right <= 0;
      })()
    `);
    assert.strictEqual(isLeftSidebarHiddenMobile, true, 'Left sidebar should be hidden off-screen on mobile');
  } finally {
    await browser.sendCommand('Emulation.clearDeviceMetricsOverride');
    if (browser.ws && browser.ws.readyState === WebSocket.OPEN) {
      browser.ws.close();
    }
  }
});

test('R2_T2_2: Verify right sidebar fixed mobile layout overlay positioning', async () => {
  const browser = new HeadlessBrowser();
  await browser.connect();
  try {
    await browser.sendCommand('Emulation.setDeviceMetricsOverride', {
      width: 375,
      height: 812,
      deviceScaleFactor: 1,
      mobile: true
    });
    await browser.navigate('http://localhost:3000');
    const isFixedRightOverlay = await browser.evaluate(`
      (() => {
        const sidebar = document.querySelector('#sidebarRight');
        sidebar.style.display = 'flex';
        const style = window.getComputedStyle(sidebar);
        return style.position === 'fixed' && style.right === '0px' && parseInt(style.zIndex) >= 10;
      })()
    `);
    assert.strictEqual(isFixedRightOverlay, true);
  } finally {
    await browser.sendCommand('Emulation.clearDeviceMetricsOverride');
    if (browser.ws && browser.ws.readyState === WebSocket.OPEN) {
      browser.ws.close();
    }
  }
});

test('R2_T2_3: Verify left sidebar backdrop click-prevention/hidden-styles on desktop', async () => {
  const browser = new HeadlessBrowser();
  await browser.connect();
  try {
    await browser.sendCommand('Emulation.setDeviceMetricsOverride', {
      width: 1024,
      height: 768,
      deviceScaleFactor: 1,
      mobile: false
    });
    await browser.navigate('http://localhost:3000');
    const isBackdropHidden = await browser.evaluate(`
      (() => {
        const backdrop = document.querySelector('#sidebarLeftBackdrop');
        const style = window.getComputedStyle(backdrop);
        return style.display === 'none' || style.opacity === '0';
      })()
    `);
    assert.strictEqual(isBackdropHidden, true);
  } finally {
    await browser.sendCommand('Emulation.clearDeviceMetricsOverride');
    if (browser.ws && browser.ws.readyState === WebSocket.OPEN) {
      browser.ws.close();
    }
  }
});

test('R2_T2_4: Verify minimum viewport width layout behavior (320px)', async () => {
  const browser = new HeadlessBrowser();
  await browser.connect();
  try {
    await browser.sendCommand('Emulation.setDeviceMetricsOverride', {
      width: 320,
      height: 568,
      deviceScaleFactor: 1,
      mobile: true
    });
    await browser.navigate('http://localhost:3000');
    const appWidth = await browser.evaluate(`
      (() => {
        return window.getComputedStyle(document.querySelector('.app')).width;
      })()
    `);
    assert.strictEqual(appWidth, '320px');
  } finally {
    await browser.sendCommand('Emulation.clearDeviceMetricsOverride');
    if (browser.ws && browser.ws.readyState === WebSocket.OPEN) {
      browser.ws.close();
    }
  }
});

test('R2_T2_5: Verify fast successive toggle click race safety', async () => {
  await runWithBrowser(async (browser) => {
    const finalDisplay = await browser.evaluate(`
      (async () => {
        const btn = document.querySelector('#toggleSidebarRightBtn');
        const sidebar = document.querySelector('#sidebarRight');
        
        btn.click();
        await new Promise(r => setTimeout(r, 50));
        btn.click();
        await new Promise(r => setTimeout(r, 50));
        btn.click();
        await new Promise(r => setTimeout(r, 50));
        btn.click();
        await new Promise(r => setTimeout(r, 50));
        btn.click();
        await new Promise(r => setTimeout(r, 50));
        
        return window.getComputedStyle(sidebar).display;
      })()
    `);
    assert.strictEqual(finalDisplay, 'flex');
  });
});


// ----------------------------------------------------------------------------
// REQUIREMENT 3: Micro-Animations & Hovers Boundaries
// ----------------------------------------------------------------------------

test('R3_T2_1: Verify send button disabled state hover transition prevention', async () => {
  await runWithBrowser(async (browser) => {
    const disabledStyleMatch = await browser.evaluate(`
      (() => {
        return [...document.styleSheets].flatMap(s => {
          try { return [...s.cssRules]; } catch { return []; }
        }).some(r => r.selectorText && r.selectorText.includes('button#sendBtn:disabled') && r.style.transform.includes('none'));
      })()
    `);
    assert.strictEqual(disabledStyleMatch, true);
  });
});

test('R3_T2_2: Verify touch-screen hover emulation for messages', async () => {
  const browser = new HeadlessBrowser();
  await browser.connect();
  try {
    await browser.sendCommand('Emulation.setTouchEmulationEnabled', {
      enabled: true,
      configuration: 'mobile'
    });
    await browser.navigate('http://localhost:3000');
    const supportsTouch = await browser.evaluate(`
      (() => {
        return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      })()
    `);
    assert.strictEqual(supportsTouch, true);
  } finally {
    await browser.sendCommand('Emulation.setTouchEmulationEnabled', { enabled: false });
    if (browser.ws && browser.ws.readyState === WebSocket.OPEN) {
      browser.ws.close();
    }
  }
});

test('R3_T2_3: Verify inner monologue expand/collapse icon rotation transitions', async () => {
  await runWithBrowser(async (browser) => {
    const hasRotationRules = await browser.evaluate(`
      (() => {
        const rules = [...document.styleSheets].flatMap(s => {
          try { return [...s.cssRules]; } catch { return []; }
        });
        const hasIconTransition = rules.some(r => r.selectorText === '.thought-toggle-icon' && r.style.transition.includes('transform'));
        const hasCollapsedRotation = rules.some(r => r.selectorText === '.message-thought.collapsed .thought-toggle-icon' && r.style.transform.includes('rotate'));
        return JSON.stringify({ hasIconTransition, hasCollapsedRotation });
      })()
    `);
    const { hasIconTransition, hasCollapsedRotation } = JSON.parse(hasRotationRules);
    assert.strictEqual(hasIconTransition, true);
    assert.strictEqual(hasCollapsedRotation, true);
  });
});

test('R3_T2_4: Verify high-frequency hover spam resilience', async () => {
  await runWithBrowser(async (browser) => {
    const finalOpacity = await browser.evaluate(`
      (() => {
        const btn = document.querySelector('#toggleSidebarRightBtn');
        for (let i = 0; i < 20; i++) {
          btn.dispatchEvent(new MouseEvent('mouseover'));
          btn.dispatchEvent(new MouseEvent('mouseout'));
        }
        return window.getComputedStyle(btn).opacity;
      })()
    `);
    assert.strictEqual(finalOpacity, '1');
  });
});

test('R3_T2_5: Verify loading spinner rotation animation declarations', async () => {
  await runWithBrowser(async (browser) => {
    const hasSpinAnimation = await browser.evaluate(`
      (() => {
        const rules = [...document.styleSheets].flatMap(s => {
          try { return [...s.cssRules]; } catch { return []; }
        });
        const hasSpinnerRule = rules.some(r => r.selectorText === '.state-loading-spinner' && r.style.animation.includes('spin'));
        const hasSpinKeyframe = rules.some(r => r.name === 'spin' && r.type === CSSRule.KEYFRAMES_RULE);
        return JSON.stringify({ hasSpinnerRule, hasSpinKeyframe });
      })()
    `);
    const { hasSpinnerRule, hasSpinKeyframe } = JSON.parse(hasSpinAnimation);
    assert.strictEqual(hasSpinnerRule, true);
    assert.strictEqual(hasSpinKeyframe, true);
  });
});


// ----------------------------------------------------------------------------
// REQUIREMENT 4: Cohesive Modals Boundaries
// ----------------------------------------------------------------------------

test('R4_T2_1: Verify clicking inside modal does not trigger backdrop close', async () => {
  await runWithBrowser(async (browser) => {
    const remainsOpen = await browser.evaluate(`
      (() => {
        const dialog = document.querySelector('#settingsDialog');
        dialog.showModal();
        const rect = dialog.getBoundingClientRect();
        // Click at precise coordinates inside the dialog
        const evt = new MouseEvent('click', {
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
          bubbles: true
        });
        dialog.dispatchEvent(evt);
        const openVal = dialog.open;
        dialog.close();
        return openVal;
      })()
    `);
    assert.strictEqual(remainsOpen, true);
  });
});

test('R4_T2_2: Verify Esc key closing active dialog', async () => {
  const browser = new HeadlessBrowser();
  await browser.connect();
  try {
    await browser.navigate('http://localhost:3000');
    await browser.evaluate(`
      (() => {
        document.querySelector('#settingsDialog').showModal();
      })()
    `);
    
    // Simulate escape key event natively
    await browser.sendCommand('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', windowsVirtualKeyCode: 27 });
    await browser.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', windowsVirtualKeyCode: 27 });
    
    await new Promise(resolve => setTimeout(resolve, 100));
    const isClosed = await browser.evaluate(`
      (() => {
        return !document.querySelector('#settingsDialog').open;
      })()
    `);
    assert.strictEqual(isClosed, true);
  } finally {
    if (browser.ws && browser.ws.readyState === WebSocket.OPEN) {
      browser.ws.close();
    }
  }
});

test('R4_T2_3: Verify nested dialog opening closes parent', async () => {
  await runWithBrowser(async (browser) => {
    const dialogStates = await browser.evaluate(`
      (() => {
        document.querySelector('#settingsDialog').showModal();
        document.querySelector('#startPromptWizardBtn').click();
        const settingsClosed = !document.querySelector('#settingsDialog').open;
        const wizardOpen = document.querySelector('#promptWizardDialog').open;
        document.querySelector('#promptWizardDialog').close();
        return JSON.stringify({ settingsClosed, wizardOpen });
      })()
    `);
    const { settingsClosed, wizardOpen } = JSON.parse(dialogStates);
    assert.strictEqual(settingsClosed, true);
    assert.strictEqual(wizardOpen, true);
  });
});

test('R4_T2_4: Verify settings input state retention when closed/reopened', async () => {
  await runWithBrowser(async (browser) => {
    const retainedVal = await browser.evaluate(`
      (() => {
        const dialog = document.querySelector('#settingsDialog');
        dialog.showModal();
        const tempInput = document.querySelector('#temperatureInput');
        tempInput.value = '1.8';
        tempInput.dispatchEvent(new Event('input', { bubbles: true }));
        dialog.close();
        
        dialog.showModal();
        const val = tempInput.value;
        dialog.close();
        return val;
      })()
    `);
    assert.strictEqual(retainedVal, '1.8');
  });
});

test('R4_T2_5: Verify double/redundant showModal calls safety', async () => {
  await runWithBrowser(async (browser) => {
    const noError = await browser.evaluate(`
      (() => {
        try {
          const dialog = document.querySelector('#settingsDialog');
          dialog.showModal();
          dialog.showModal();
          dialog.close();
          return true;
        } catch (e) {
          return false;
        }
      })()
    `);
    assert.strictEqual(noError, true);
  });
});
