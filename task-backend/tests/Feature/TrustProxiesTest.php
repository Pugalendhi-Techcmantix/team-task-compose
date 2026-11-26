<?php

namespace Tests\Feature;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class TrustProxiesTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Route::get('/api/_test/ip', fn (Request $request) => ['ip' => $request->ip()]);
    }

    public function test_forwarded_ip_is_used_when_request_comes_from_gateway(): void
    {
        $this->getJson('/api/_test/ip', ['X-Forwarded-For' => '203.0.113.7'])
            ->assertJsonPath('ip', '203.0.113.7'); // test client = 127.0.0.1 (trusted)
    }

    public function test_forwarded_ip_is_ignored_from_untrusted_source(): void
    {
        $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.20'])
            ->getJson('/api/_test/ip', ['X-Forwarded-For' => '203.0.113.7'])
            ->assertJsonPath('ip', '198.51.100.20'); // spoofed header cannot bypass login throttling
    }
}
