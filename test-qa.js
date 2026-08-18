async function run() {
  try {
    const url = 'http://localhost:3001';
    
    // 1. Health check to ensure server is up
    let up = false;
    for (let i = 0; i < 10; i++) {
        try {
            const hRes = await fetch(url + '/health');
            if (hRes.ok) { up = true; break; }
        } catch(e) {}
        await new Promise(r => setTimeout(r, 1000));
    }
    if (!up) throw new Error("Server not up");

    // 2. Create project
    const pRes = await fetch(url + '/api/projects', { method: 'POST', body: JSON.stringify({name: 'QA Project'}) });
    const project = await pRes.json();
    console.log('Project:', project.id);
    
    // 3. Create env
    const eRes = await fetch(url + `/api/projects/${project.id}/environments`, { method: 'POST', body: JSON.stringify({name: 'QA Env', baseUrl: 'https://example.com'}) });
    const env = await eRes.json();
    console.log('Env:', env.id);

    // 4. Create test
    const tRes = await fetch(url + `/api/projects/${project.id}/tests`, { method: 'POST', body: JSON.stringify({name: 'QA Test'}) });
    const test = await tRes.json();
    console.log('Test:', test.id);

    // 5. Update steps
    const stepsRes = await fetch(url + `/api/tests/${test.id}/steps`, { method: 'PUT', body: JSON.stringify({steps: [{type: 'wait', config: {}}]}) });
    const testWithSteps = await stepsRes.json();
    console.log('Test with Steps:', testWithSteps.steps.length);

    // 6. Run test
    const runRes = await fetch(url + `/api/tests/${test.id}/runs`, { method: 'POST', body: JSON.stringify({environmentId: env.id}) });
    const run = await runRes.json();
    
    if (run.error) {
      console.error('Run failed:', run);
      process.exit(1);
    }
    
    console.log('Run details:', run.id, run.status);
    console.log('ALL PASSED');
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
run();
