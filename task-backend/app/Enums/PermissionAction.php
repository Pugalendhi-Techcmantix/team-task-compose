<?php

namespace App\Enums;

/** The four actions every module is protected by. */
enum PermissionAction: string
{
    case View = 'view';
    case Create = 'create';
    case Update = 'update';
    case Delete = 'delete';

    /** Database column on role_permissions / user_permissions. */
    public function column(): string
    {
        return 'can_'.$this->value;
    }

    /** @return list<string> */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
