<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            AccessControlSeeder::class, // modules, roles, default permissions
            UserSeeder::class,          // sample users
            TaskSeeder::class,          // demo tasks
            ChatSeeder::class,          // sample conversations for the Node.js realtime service
        ]);
    }
}
