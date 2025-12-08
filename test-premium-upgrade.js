// Simple test script to verify premium upgrade flow
const API_BASE_URL = 'http://localhost:5000/api';

async function testPremiumUpgrade() {
  console.log('Testing premium upgrade flow...\n');

  try {
    // Step 1: Login to get a token
    console.log('Step 1: Logging in...');
    const loginResponse = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'student@smartstudy.com',
        password: 'student123'
      })
    });

    if (!loginResponse.ok) {
      const errorData = await loginResponse.json();
      throw new Error(`Login failed: ${errorData.message || loginResponse.statusText}`);
    }

    const loginData = await loginResponse.json();

    const token = loginData.token;
    console.log('Login successful, got token\n');

    // Step 2: Check initial premium status
    console.log('Step 2: Checking initial premium status...');
    const profileResponse = await fetch(`${API_BASE_URL}/users/profile`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!profileResponse.ok) {
      throw new Error('Failed to get profile');
    }

    const profileData = await profileResponse.json();
    console.log('Initial premium status:', profileData.data.is_premium);
    console.log('User data keys:', Object.keys(profileData.data));

    // Step 3: Upgrade to premium
    console.log('\nStep 3: Upgrading to premium...');
    const upgradeResponse = await fetch(`${API_BASE_URL}/users/upgrade-premium`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!upgradeResponse.ok) {
      throw new Error('Upgrade failed');
    }

    const upgradeData = await upgradeResponse.json();
    console.log('Upgrade response:', upgradeData);
    console.log('Returned premium status:', upgradeData.data.is_premium);

    // Step 4: Refresh profile to check updated status
    console.log('\nStep 4: Refreshing profile to verify update...');
    const profileResponse2 = await fetch(`${API_BASE_URL}/users/profile`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!profileResponse2.ok) {
      throw new Error('Failed to get updated profile');
    }

    const profileData2 = await profileResponse2.json();
    console.log('Updated premium status:', profileData2.data.is_premium);

    // Verify the fix
    if (profileData2.data.is_premium === true) {
      console.log('\n✅ SUCCESS: Premium upgrade flow works correctly!');
      console.log('The backend correctly updates is_premium to true');
    } else {
      console.log('\n❌ FAILED: Premium status was not updated');
    }

  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testPremiumUpgrade();
