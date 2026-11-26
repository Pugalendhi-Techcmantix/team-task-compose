<?php

namespace App\Providers;

use App\Contracts\RealtimePublisher;
use App\Contracts\TaskEventPublisher;
use App\Services\RedisRealtimePublisher;
use App\Services\RedisTaskEventPublisher;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // One publisher for every realtime event (tasks, notification counts) → Redis, after commit.
        $this->app->singleton(RealtimePublisher::class, fn ($app) => new RedisRealtimePublisher(
            redis: $app['redis'],
            channel: (string) config('services.realtime.channel'),
        ));

        $this->app->singleton(TaskEventPublisher::class, fn ($app) => new RedisTaskEventPublisher(
            $app->make(RealtimePublisher::class),
        ));
    }

    public function boot(): void
    {
        // Single resources are wrapped in {"data": ...}; collections already are.
        JsonResource::wrap('data');

        // Brute-force protection: 5 attempts / minute per email + IP.
        RateLimiter::for('login', function (Request $request) {
            $email = mb_strtolower(trim((string) $request->input('email')));

            return Limit::perMinute(5)->by($email.'|'.$request->ip());
        });

        // Internal service calls (Node.js → Laravel): one per chat message, so a much higher ceiling.
        RateLimiter::for('internal', fn (Request $request) => Limit::perMinute(6000)->by('internal|'.$request->ip()));

        // General API limit: 120 req / minute per user (or IP when anonymous).
        RateLimiter::for('api', function (Request $request) {
            return Limit::perMinute(120)->by($request->user()?->id ?: $request->ip());
        });
    }
}
