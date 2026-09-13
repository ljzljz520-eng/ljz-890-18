<?php
/**
 * 照片控制器（草稿 / 预览 / 发布）
 */

namespace App\Controllers;

use App\Models\Photo;
use App\Utils\Response;
use App\Utils\Validator;
use App\Utils\Logger;
use App\Utils\JWT;

class PhotoController
{
    private Photo $photoModel;
    private Logger $logger;

    public function __construct()
    {
        require_once __DIR__ . '/../Models/BaseModel.php';
        require_once __DIR__ . '/../Models/Draftable.php';
        require_once __DIR__ . '/../Models/Photo.php';
        $this->photoModel = new Photo();
        $this->logger = Logger::getInstance();
    }

    /**
     * 获取已发布照片（前台展示用，草稿不会出现）
     */
    public function getAll(): array
    {
        $photos = $this->photoModel->getPublishedSorted();
        return Response::success($photos);
    }

    /**
     * 获取所有照片（后台管理用，含草稿与 effective_* 预览字段）
     */
    public function getAllAdmin(): array
    {
        $photos = $this->photoModel->getAllForAdmin();
        return Response::success($photos);
    }

    /**
     * 新建照片草稿（status=0，不会出现在前台）
     */
    public function create(): array
    {
        $data = json_decode(file_get_contents('php://input'), true) ?? [];

        $validator = new Validator($data);
        $validator->required('title', '标题')
                  ->maxLength('title', 255, '标题')
                  ->required('image_url', '图片地址');

        if (!$validator->validate()) {
            return Response::error($validator->getFirstError(), 400);
        }

        $draft = [
            'title' => trim($data['title']),
            'image_url' => $data['image_url'],
            'description' => $data['description'] ?? '',
            'sort_order' => (int)($data['sort_order'] ?? 0),
        ];

        $id = $this->photoModel->create([
            'title' => trim($data['title']),
            'image_url' => $data['image_url'],
            'description' => $data['description'] ?? '',
            'sort_order' => (int)($data['sort_order'] ?? 0),
            'status' => 0,
            'has_draft' => 1,
            'draft_data' => json_encode($draft, JSON_UNESCAPED_UNICODE),
            'created_at' => date('Y-m-d H:i:s')
        ]);

        $photo = $this->photoModel->findEffective($id);
        $this->logger->info("Photo draft created", ['id' => $id]);

        return Response::success($photo, '草稿已保存，请预览确认后发布');
    }

    /**
     * 保存草稿修改（含照片标题、照片说明，不动已发布内容）
     */
    public function update(int $id): array
    {
        $photo = $this->photoModel->find($id);
        if (!$photo) {
            return Response::error('照片不存在', 404);
        }

        $data = json_decode(file_get_contents('php://input'), true) ?? [];

        $validator = new Validator($data);
        $validator->required('title', '标题')
                  ->maxLength('title', 255, '标题')
                  ->required('image_url', '图片地址');

        if (!$validator->validate()) {
            return Response::error($validator->getFirstError(), 400);
        }

        $draft = [
            'title' => trim($data['title']),
            'image_url' => $data['image_url'],
            'description' => $data['description'] ?? '',
            'sort_order' => (int)($data['sort_order'] ?? 0),
        ];

        $photo = $this->photoModel->saveDraft($id, $draft);
        $this->logger->info("Photo draft saved", ['id' => $id]);

        return Response::success($photo, '草稿已保存，请预览确认后发布');
    }

    /**
     * 发布：草稿合并为正式内容，前台立即可见
     */
    public function publish(int $id): array
    {
        $photo = $this->photoModel->find($id);
        if (!$photo) {
            return Response::error('照片不存在', 404);
        }

        $published = $this->photoModel->publishDraft($id);
        $this->logger->info("Photo published", ['id' => $id]);

        return Response::success($published, '已发布，前台已更新');
    }

    /**
     * 放弃草稿（已发布内容保持不变；从未发布的草稿记录被删除）
     */
    public function discard(int $id): array
    {
        $photo = $this->photoModel->find($id);
        if (!$photo) {
            return Response::error('照片不存在', 404);
        }

        if ((int)$photo['status'] === 0) {
            $this->photoModel->delete($id);
            $this->logger->info("Photo unpublished draft deleted", ['id' => $id]);
            return Response::success(null, '草稿已删除');
        }

        $this->photoModel->clearDraft($id);
        $this->logger->info("Photo draft discarded", ['id' => $id]);
        return Response::success($this->photoModel->find($id), '已放弃草稿修改，恢复为已发布版本');
    }

    /**
     * 生成预览链接令牌
     */
    public function previewToken(int $id): array
    {
        $photo = $this->photoModel->find($id);
        if (!$photo) {
            return Response::error('照片不存在', 404);
        }

        $token = JWT::generatePreviewToken(['scope' => 'photo', 'id' => $id]);
        return Response::success([
            'token' => $token,
            'preview_url' => "/preview?scope=photo&id={$id}&preview_token=" . urlencode($token) . "#photo-{$id}",
            'expires_in' => JWT::$previewExpireTime,
        ], '预览链接已生成');
    }

    /**
     * 删除照片（已发布内容与草稿一并删除）
     */
    public function delete(int $id): array
    {
        $photo = $this->photoModel->find($id);
        if (!$photo) {
            return Response::error('照片不存在', 404);
        }

        $this->photoModel->delete($id);
        $this->logger->info("Photo deleted", ['id' => $id]);

        return Response::success(null, '照片删除成功');
    }
}
