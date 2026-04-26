async function blastServer() {
  const url = 'http://biobeats.duckdns.org/api/discovery/trending';

  // The token from your Flutter logs!
  const myToken =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5Y2ZkYjg1ZjQ5YzBmOGVlZGEzNzljNiIsInJvbGUiOiJBcnRpc3QiLCJpYXQiOjE3NzcyMDI5OTYsImV4cCI6MTc3NzIwMzg5Nn0.XOehmu5KEFXlHer7g89i99-UBfyyHZhE0I5YJ-Yz3YI';

  console.log(`🚀 Blasting ${url} simulating the Mobile App (Logged In)...`);

  const requests = Array.from({ length: 5 }).map(() =>
    fetch(url, {
      headers: {
        Authorization: `Bearer ${myToken}`,
        'Content-Type': 'application/json',
      },
    })
  );

  try {
    const responses = await Promise.all(requests);

    for (let i = 0; i < responses.length; i++) {
      const res = responses[i];

      if (!res.ok) {
        const errorData = await res.json();
        console.log(
          `\n🔥 BANG! Request ${i + 1} failed with status ${res.status}`
        );
        console.log('🛑 === REAL BACKEND ERROR === 🛑');
        console.log(JSON.stringify(errorData, null, 2));
        console.log('🛑 ========================== 🛑\n');
        return;
      }
    }
    console.log('✅ All requests succeeded! No 500 error occurred.');
  } catch (err) {
    console.error('Network error:', err.message);
  }
}

blastServer();
