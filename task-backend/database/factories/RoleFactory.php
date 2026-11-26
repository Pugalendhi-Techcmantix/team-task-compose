<?php

namespace Database\Factories;

use App\Models\Role;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Role>
 */
class RoleFactory extends Factory
{
    /** @return array<string, mixed> */
    public function definition(): array
    {
        $name = 'Role '.Str::upper(Str::random(6));

        return [
            'name' => $name,
            'slug' => Str::slug($name, '_'),
            'description' => fake()->sentence(),
        ];
    }
}
