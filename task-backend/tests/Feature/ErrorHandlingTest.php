<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ErrorHandlingTest extends TestCase
{
    use RefreshDatabase;

    public function test_unknown_api_route_returns_json_404(): void
    {
        $this->assertApiError($this->get('/api/v1/does-not-exist'), 404, 'not_found');
    }

    public function test_response_is_json_even_without_accept_header(): void
    {
        $this->get('/api/v1/auth/me')
            ->assertStatus(401)
            ->assertHeader('Content-Type', 'application/json')
            ->assertJsonPath('error.code', 'unauthenticated');
    }

    public function test_malformed_json_body_returns_400(): void
    {
        $response = $this->call(
            'POST',
            '/api/v1/auth/login',
            server: ['CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json'],
            content: '{"email": "a@b.c", "password": ',
        );

        $this->assertApiError($response, 400, 'invalid_json');
    }

    public function test_wrong_http_method_returns_405(): void
    {
        $this->assertApiError($this->deleteJson('/api/v1/auth/login'), 405, 'method_not_allowed');
    }

    public function test_non_numeric_task_id_returns_404_not_500(): void
    {
        $this->actingAsUser();

        $this->assertApiError($this->getJson('/api/v1/tasks/abc'), 404, 'not_found');
        $this->assertApiError($this->getJson('/api/v1/tasks/99999999999999999999999'), 404, 'not_found');
    }

    public function test_cors_preflight_allows_configured_origin(): void
    {
        $this->call('OPTIONS', '/api/v1/tasks', server: [
            'HTTP_ORIGIN' => 'http://localhost:8080',
            'HTTP_ACCESS_CONTROL_REQUEST_METHOD' => 'POST',
            'HTTP_ACCESS_CONTROL_REQUEST_HEADERS' => 'authorization,content-type',
        ])
            ->assertNoContent()
            ->assertHeader('Access-Control-Allow-Origin', 'http://localhost:8080');
    }

    public function test_cors_never_allows_unknown_origin(): void
    {
        $response = $this->call('OPTIONS', '/api/v1/tasks', server: [
            'HTTP_ORIGIN' => 'https://evil.example.com',
            'HTTP_ACCESS_CONTROL_REQUEST_METHOD' => 'POST',
        ]);

        // With one configured origin the header always names that origin, so the browser blocks the request.
        $this->assertNotSame('https://evil.example.com', $response->headers->get('Access-Control-Allow-Origin'));
        $this->assertNotSame('*', $response->headers->get('Access-Control-Allow-Origin'));
    }
}
