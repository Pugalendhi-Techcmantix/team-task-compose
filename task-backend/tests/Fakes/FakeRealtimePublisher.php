<?php

namespace Tests\Fakes;

use App\Contracts\RealtimePublisher;
use PHPUnit\Framework\Assert;

class FakeRealtimePublisher implements RealtimePublisher
{
    /** @var list<array{event:string, payload:array<string,mixed>}> */
    public array $published = [];

    public function publish(string $event, array $payload): void
    {
        $this->published[] = ['event' => $event, 'payload' => $payload];
    }

    /** @param  array<string, mixed>  $payload */
    public function assertPublished(string $event, array $payload): void
    {
        Assert::assertContains(['event' => $event, 'payload' => $payload], $this->published,
            'Published: '.json_encode($this->published));
    }

    public function assertNothingPublished(): void
    {
        Assert::assertSame([], $this->published);
    }
}
