<?php

namespace Database\Seeders;

use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Sample users. Create-only: users edited through the API (role, password,
 * active flag) are never reset by a later seeder run.
 */
class UserSeeder extends Seeder
{
    /** @var list<array{name:string, email:string, role:string}> */
    public const USERS = [
        ['name' => 'Super Admin', 'email' => 'admin@taskflow.test', 'role' => Role::SUPER_ADMIN],
        ['name' => 'Priya Raman', 'email' => 'priya@taskflow.test', 'role' => Role::USER],
        ['name' => 'Arun Kumar', 'email' => 'arun@taskflow.test', 'role' => Role::USER],
    ];

    public function run(): void
    {
        $password = (string) config('auth.seed_default_password');

        foreach (self::USERS as $user) {
            User::withTrashed()->firstOrCreate(
                ['email' => $user['email']],
                [
                    'name' => $user['name'],
                    'role_id' => Role::idFor($user['role']),
                    'password' => $password, // hashed by the model cast
                    'is_active' => true,
                    'email_verified_at' => now(),
                ],
            );
        }
    }
}
