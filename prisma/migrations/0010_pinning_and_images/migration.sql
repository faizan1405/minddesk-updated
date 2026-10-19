-- AlterTable
ALTER TABLE `projects` ADD COLUMN `is_pinned` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `pages` ADD COLUMN `is_pinned` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `mind_maps` ADD COLUMN `is_pinned` BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX `projects_user_id_is_pinned_idx` ON `projects`(`user_id`, `is_pinned`);
CREATE INDEX `pages_user_id_is_pinned_idx` ON `pages`(`user_id`, `is_pinned`);
CREATE INDEX `mind_maps_user_id_is_pinned_idx` ON `mind_maps`(`user_id`, `is_pinned`);

-- CreateTable note_images
CREATE TABLE `note_images` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `file_name` VARCHAR(255) NOT NULL,
    `file_size` INTEGER NOT NULL,
    `mime_type` VARCHAR(100) NOT NULL,
    `storage_key` VARCHAR(255) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `note_images_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `note_images` ADD CONSTRAINT `note_images_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
