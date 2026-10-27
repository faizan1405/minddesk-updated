-- Migration 0012: Auth Rate Limits
-- Additive table for persistent brute-force login and re-authentication protection

CREATE TABLE `auth_rate_limits` (
    `id` CHAR(36) NOT NULL,
    `key` VARCHAR(128) NOT NULL,
    `points` INTEGER NOT NULL DEFAULT 1,
    `first_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    `blocked_until` DATETIME(3) NULL,

    UNIQUE INDEX `auth_rate_limits_key_key`(`key`),
    INDEX `auth_rate_limits_blocked_until_idx`(`blocked_until`),
    INDEX `auth_rate_limits_last_at_idx`(`last_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
