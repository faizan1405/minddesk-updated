-- Migration 0011: My Private Vault (Passwords & Document Keeper)
-- Additive tables for zero-knowledge client-side encrypted vault

-- CreateTable: vault_meta
CREATE TABLE `vault_meta` (
    `user_id` CHAR(36) NOT NULL,
    `salt` VARCHAR(64) NOT NULL,
    `iterations` INTEGER NOT NULL DEFAULT 3,
    `memory_cost` INTEGER NOT NULL DEFAULT 19456,
    `parallelism` INTEGER NOT NULL DEFAULT 1,
    `wrapped_key` TEXT NOT NULL,
    `wrapped_key_iv` VARCHAR(64) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: vault_entries
CREATE TABLE `vault_entries` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `encrypted_data` LONGTEXT NOT NULL,
    `iv` VARCHAR(64) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    INDEX `vault_entries_user_id_updated_at_idx`(`user_id`, `updated_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: vault_documents
CREATE TABLE `vault_documents` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `encrypted_data` LONGTEXT NOT NULL,
    `iv` VARCHAR(64) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    INDEX `vault_documents_user_id_updated_at_idx`(`user_id`, `updated_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: vault_document_attachments
CREATE TABLE `vault_document_attachments` (
    `id` CHAR(36) NOT NULL,
    `document_id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `storage_key` VARCHAR(255) NOT NULL,
    `encrypted_size` INTEGER NOT NULL,
    `iv` VARCHAR(64) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `vault_document_attachments_document_id_idx`(`document_id`),
    INDEX `vault_document_attachments_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKeys
ALTER TABLE `vault_meta` ADD CONSTRAINT `vault_meta_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `vault_entries` ADD CONSTRAINT `vault_entries_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `vault_documents` ADD CONSTRAINT `vault_documents_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `vault_document_attachments` ADD CONSTRAINT `vault_document_attachments_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `vault_documents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `vault_document_attachments` ADD CONSTRAINT `vault_document_attachments_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
