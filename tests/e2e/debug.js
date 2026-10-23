const HeadlessBrowser = require('../helpers/browser.js');

async function debug() {
  const browser = new HeadlessBrowser();
  await browser.connect();
  
  try {
    await browser.navigate('http://localhost:3000');
    
    // Debug R4_T1_4: debug dialog opening
    const r4_t1_4_result = await browser.evaluate(`
      try {
        const btn = document.querySelector('#debugMenuBtn');
        btn.click();
        const open = document.querySelector('#debugDialog').open;
        document.querySelector('#debugDialog').close();
        'Result: ' + open;
      } catch (e) {
        'Error: ' + e.toString() + '\\n' + e.stack;
      }
    `);
    console.log('R4_T1_4 Debug Result:', r4_t1_4_result);

    // Debug R2_T2_5: fast successive click
    const r2_t2_5_result = await browser.evaluate(`
      try {
        const btn = document.querySelector('#toggleSidebarRightBtn');
        const results = [];
        results.push(window.getComputedStyle(document.querySelector('#sidebarRight')).display);
        
        btn.click();
        results.push(window.getComputedStyle(document.querySelector('#sidebarRight')).display);
        
        btn.click();
        results.push(window.getComputedStyle(document.querySelector('#sidebarRight')).display);
        
        btn.click();
        results.push(window.getComputedStyle(document.querySelector('#sidebarRight')).display);
        
        btn.click();
        results.push(window.getComputedStyle(document.querySelector('#sidebarRight')).display);
        
        btn.click();
        results.push(window.getComputedStyle(document.querySelector('#sidebarRight')).display);
        
        return results.join(', ');
      } catch (e) {
        return 'Error: ' + e.toString();
      }
    `);
    console.log('R2_T2_5 Debug Result:', r2_t2_5_result);
    
  } catch (err) {
    console.error('Debug script error:', err);
  } finally {
    if (browser.ws) browser.ws.close();
  }
}

debug();
