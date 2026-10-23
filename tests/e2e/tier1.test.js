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
// REQUIREMENT 1: Glassmorphism & Dark Theme
// ----------------------------------------------------------------------------

test('R1_T1_1: Verify root variables are defined on :root', async () => {
  await runWithBrowser(async (browser) => {
    const varsJson = await browser.evaluate(`
      (() => {
        const bgApp = window.getComputedStyle(document.documentElement).getPropertyValue('--bg-app').trim();
        const glassBlur = window.getComputedStyle(document.documentElement).getPropertyValue('--glass-blur').trim();
        return JSON.stringify({ bgApp, glassBlur });
      })()
    `);
    const { bgApp, glassBlur } = JSON.parse(varsJson);
    assert.strictEqual(bgApp, '#05070a');
    assert.strictEqual(glassBlur, '16px');
  });
});

test('R1_T1_2: Verify computed CSS glass properties for left sidebar', async () => {
  await runWithBrowser(async (browser) => {
    const glassProps = await browser.evaluate(`
      (() => {
        const sidebar = document.querySelector('#sidebarLeft');
        const style = window.getComputedStyle(sidebar);
        const blurVal = style.backdropFilter || style.webkitBackdropFilter;
        const borderRightVal = style.borderRight;
        return JSON.stringify({ blurVal, borderRightVal });
      })()
    `);
    const { blurVal, borderRightVal } = JSON.parse(glassProps);
    assert.ok(blurVal.includes('blur'), 'Backdrop filter should include blur');
    assert.ok(borderRightVal.includes('rgba') || borderRightVal.includes('solid'), 'Border right should be defined');
  });
});

test('R1_T1_3: Verify Outfit font application', async () => {
  await runWithBrowser(async (browser) => {
    const fontFamily = await browser.evaluate(`
      (() => {
        return window.getComputedStyle(document.body).fontFamily;
      })()
    `);
    assert.ok(fontFamily.includes('Outfit'), 'Font family should include Outfit');
  });
});

test('R1_T1_4: Verify body background radial gradient', async () => {
  await runWithBrowser(async (browser) => {
    const bodyBg = await browser.evaluate(`
      (() => {
        return window.getComputedStyle(document.body).background;
      })()
    `);
    assert.ok(bodyBg.includes('radial-gradient'), 'Body background should include radial gradients');
  });
});

test('R1_T1_5: Verify translucent border color properties on glass panels', async () => {
  await runWithBrowser(async (browser) => {
    const glassBorder = await browser.evaluate(`
      (() => {
        return window.getComputedStyle(document.documentElement).getPropertyValue('--glass-border').trim();
      })()
    `);
    assert.strictEqual(glassBorder, 'rgba(255, 255, 255, 0.05)');
  });
});


// ----------------------------------------------------------------------------
// REQUIREMENT 2: Layout Collapsible Panels
// ----------------------------------------------------------------------------

test('R2_T1_1: Verify right sidebar initial hidden state', async () => {
  await runWithBrowser(async (browser) => {
    const display = await browser.evaluate(`
      (() => {
        return window.getComputedStyle(document.querySelector('#sidebarRight')).display;
      })()
    `);
    assert.strictEqual(display, 'none');
  });
});

test('R2_T1_2: Verify opening right sidebar via toggle button', async () => {
  await runWithBrowser(async (browser) => {
    const displayAfterClick = await browser.evaluate(`
      (() => {
        document.querySelector('#toggleSidebarRightBtn').click();
        return window.getComputedStyle(document.querySelector('#sidebarRight')).display;
      })()
    `);
    assert.strictEqual(displayAfterClick, 'flex');
  });
});

test('R2_T1_3: Verify closing right sidebar via internal close button', async () => {
  await runWithBrowser(async (browser) => {
    const displayAfterClose = await browser.evaluate(`
      (() => {
        document.querySelector('#sidebarRight').style.display = 'flex';
        document.querySelector('#closeSidebarRightBtn').click();
        return window.getComputedStyle(document.querySelector('#sidebarRight')).display;
      })()
    `);
    assert.strictEqual(displayAfterClose, 'none');
  });
});

test('R2_T1_4: Verify persistence of right sidebar open state in localStorage after reload', async () => {
  const browser = new HeadlessBrowser();
  await browser.connect();
  try {
    await browser.navigate('http://localhost:3000');
    await browser.evaluate(`
      (() => {
        localStorage.setItem('show_sidebar_right', 'true');
      })()
    `);
    await browser.navigate('http://localhost:3000');
    const display = await browser.evaluate(`
      (() => {
        return window.getComputedStyle(document.querySelector('#sidebarRight')).display;
      })()
    `);
    assert.strictEqual(display, 'flex');
  } finally {
    if (browser.ws && browser.ws.readyState === WebSocket.OPEN) {
      browser.ws.close();
    }
  }
});

test('R2_T1_5: Verify left sidebar mobile hamburger toggle adding active class', async () => {
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
    const isActive = await browser.evaluate(`
      (() => {
        document.querySelector('#toggleSidebarLeftBtn').click();
        return document.querySelector('#sidebarLeft').classList.contains('active');
      })()
    `);
    assert.strictEqual(isActive, true);
  } finally {
    await browser.sendCommand('Emulation.clearDeviceMetricsOverride');
    if (browser.ws && browser.ws.readyState === WebSocket.OPEN) {
      browser.ws.close();
    }
  }
});

test('R2_T1_6: Verify left sidebar mobile backdrop click closing', async () => {
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
    const isClosed = await browser.evaluate(`
      (() => {
        document.querySelector('#sidebarLeft').classList.add('active');
        document.querySelector('#sidebarLeftBackdrop').classList.add('active');
        document.querySelector('#sidebarLeftBackdrop').click();
        return !document.querySelector('#sidebarLeft').classList.contains('active');
      })()
    `);
    assert.strictEqual(isClosed, true);
  } finally {
    await browser.sendCommand('Emulation.clearDeviceMetricsOverride');
    if (browser.ws && browser.ws.readyState === WebSocket.OPEN) {
      browser.ws.close();
    }
  }
});


// ----------------------------------------------------------------------------
// REQUIREMENT 3: Micro-Animations & Hovers
// ----------------------------------------------------------------------------

test('R3_T1_1: Verify send button transition presence', async () => {
  await runWithBrowser(async (browser) => {
    const transition = await browser.evaluate(`
      (() => {
        return window.getComputedStyle(document.querySelector('#sendBtn')).transition;
      })()
    `);
    assert.ok(transition.includes('0.2s') || transition.includes('all'), 'Transition should be present on send button');
  });
});

test('R3_T1_2: Verify hover styles defined in stylesheet for close-sidebar-btn', async () => {
  await runWithBrowser(async (browser) => {
    const hasHoverRule = await browser.evaluate(`
      (() => {
        return [...document.styleSheets].flatMap(s => {
          try { return [...s.cssRules]; } catch { return []; }
        }).some(r => r.selectorText && r.selectorText.includes('.close-sidebar-btn:hover'));
      })()
    `);
    assert.strictEqual(hasHoverRule, true);
  });
});

test('R3_T1_3: Verify action hover background tints definition in CSS', async () => {
  await runWithBrowser(async (browser) => {
    const hasTintRule = await browser.evaluate(`
      (() => {
        return [...document.styleSheets].flatMap(s => {
          try { return [...s.cssRules]; } catch { return []; }
        }).some(r => r.selectorText === '.message-actions-inline .action-btn:hover' && r.style.background.includes('rgba(16, 185, 129, 0.2)'));
      })()
    `);
    assert.strictEqual(hasTintRule, true);
  });
});

test('R3_T1_4: Verify dialog close button hover highlight styles in CSS', async () => {
  await runWithBrowser(async (browser) => {
    const hasHighlightRule = await browser.evaluate(`
      (() => {
        return [...document.styleSheets].flatMap(s => {
          try { return [...s.cssRules]; } catch { return []; }
        }).some(r => r.selectorText === '.close-dialog-btn:hover' && r.style.background.includes('rgba(239, 68, 68, 0.15)'));
      })()
    `);
    assert.strictEqual(hasHighlightRule, true);
  });
});

test('R3_T1_5: Verify custom state card border highlight transition property', async () => {
  await runWithBrowser(async (browser) => {
    const transition = await browser.evaluate(`
      (() => {
        const card = document.createElement('div');
        card.className = 'custom-state-card';
        document.body.appendChild(card);
        const style = window.getComputedStyle(card).transition;
        card.remove();
        return style;
      })()
    `);
    assert.ok(transition.includes('0.2s') || transition.includes('all'), 'Transition should be defined on custom state card');
  });
});


// ----------------------------------------------------------------------------
// REQUIREMENT 4: Cohesive Modals
// ----------------------------------------------------------------------------

test('R4_T1_1: Verify settings dialog opening/closing', async () => {
  await runWithBrowser(async (browser) => {
    const openState = await browser.evaluate(`
      (() => {
        document.querySelector('#openSettingsBtn').click();
        const openAfterClick = document.querySelector('#settingsDialog').open;
        document.querySelector('#settingsDialog').querySelector('.close-dialog-btn').click();
        const openAfterClose = document.querySelector('#settingsDialog').open;
        return JSON.stringify({ openAfterClick, openAfterClose });
      })()
    `);
    const { openAfterClick, openAfterClose } = JSON.parse(openState);
    assert.strictEqual(openAfterClick, true);
    assert.strictEqual(openAfterClose, false);
  });
});

test('R4_T1_2: Verify admin dialog opening from settings closes settings', async () => {
  await runWithBrowser(async (browser) => {
    const transitionState = await browser.evaluate(`
      (() => {
        document.querySelector('#settingsDialog').showModal();
        document.querySelector('#manageCharactersBtn').click();
        const settingsOpen = document.querySelector('#settingsDialog').open;
        const adminOpen = document.querySelector('#adminDialog').open;
        document.querySelector('#adminDialog').close();
        return JSON.stringify({ settingsOpen, adminOpen });
      })()
    `);
    const { settingsOpen, adminOpen } = JSON.parse(transitionState);
    assert.strictEqual(settingsOpen, false);
    assert.strictEqual(adminOpen, true);
  });
});

test('R4_T1_3: Verify persona CRUD modal forms presence', async () => {
  await runWithBrowser(async (browser) => {
    const hasFormElements = await browser.evaluate(`
      (() => {
        document.querySelector('#openPersonaBtn').click();
        const isOpen = document.querySelector('#personaDialog').open;
        const hasNameInput = !!document.querySelector('#personaNameInput');
        const hasUserNameInput = !!document.querySelector('#personaUserNameInput');
        document.querySelector('#personaDialog').close();
        return JSON.stringify({ isOpen, hasNameInput, hasUserNameInput });
      })()
    `);
    const { isOpen, hasNameInput, hasUserNameInput } = JSON.parse(hasFormElements);
    assert.strictEqual(isOpen, true);
    assert.strictEqual(hasNameInput, true);
    assert.strictEqual(hasUserNameInput, true);
  });
});

test('R4_T1_4: Verify debug dialog opening', async () => {
  await runWithBrowser(async (browser) => {
    const isOpen = await browser.evaluate(`
      (() => {
        try {
          const btn = document.querySelector('#debugMenuBtn');
          if (!btn) return 'Error: debugMenuBtn not found';
          const dialog = document.querySelector('#debugDialog');
          if (!dialog) return 'Error: debugDialog not found';
          btn.click();
          const val = dialog.open;
          dialog.close();
          return val;
        } catch (e) {
          return 'Error: ' + e.message + '\\n' + e.stack;
        }
      })()
    `);
    assert.strictEqual(isOpen, true);
  });
});

test('R4_T1_5: Verify backdrop click auto-close logic', async () => {
  await runWithBrowser(async (browser) => {
    const closedOnBackdropClick = await browser.evaluate(`
      (() => {
        const dialog = document.querySelector('#settingsDialog');
        dialog.showModal();
        const rect = dialog.getBoundingClientRect();
        const evt = new MouseEvent('click', {
          clientX: rect.left - 10,
          clientY: rect.top - 10,
          bubbles: true
        });
        dialog.dispatchEvent(evt);
        return !dialog.open;
      })()
    `);
    assert.strictEqual(closedOnBackdropClick, true);
  });
});
