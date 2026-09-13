<?php
/**
 * 生平事件控制器（草稿 / 预览 / 发布）
 */

namespace App\Controllers;

use App\Models\LifeEvent;
use App\Utils\Response;
use App\Utils\Validator;
use App\Utils\Logger;
use App\Utils\JWT;

class LifeEventController
{
    private LifeEvent $eventModel;
    private Logger $logger;

    public function __construct()
    {
        require_once __DIR__ . '/../Models/BaseModel.php';
        require_once __DIR__ . '/../Models/Draftable.php';
        require_once __DIR__ . '/../Models/LifeEvent.php';
        $this->eventModel = new LifeEvent();
        $this->logger = Logger::getInstance();
    }

    /**
     * 获取已发布事件（前台展示用，草稿不会出现）
     */
    public function getAll(): array
    {
        $events = $this->eventModel->getPublishedSorted();
        return Response::success($events);
    }

    /**
     * 获取所有事件（后台管理用，含草稿与 effective_* 预览字段）
     */
    public function getAllAdmin(): array
    {
        $events = $this->eventModel->getAllForAdmin();
        return Response::success($events);
    }

    /**
     * 新建事件草稿（status=0，不会出现在前台）
     */
    public function create(): array
    {
        $data = json_decode(file_get_contents('php://input'), true) ?? [];

        $validator = new Validator($data);
        $validator->required('title', '标题')
                  ->maxLength('title', 255, '标题')
                  ->required('event_date', '事件日期')
                  ->date('event_date', '事件日期');

        if (!$validator->validate()) {
            return Response::error($validator->getFirstError(), 400);
        }

        // 正式字段先放占位空值（从未发布），完整内容暂存在 draft_data
        $id = $this->eventModel->create([
            'title' => trim($data['title']),
            'event_date' => $data['event_date'],
            'content' => $data['content'] ?? '',
            'image_url' => $data['image_url'] ?? '',
            'sort_order' => (int)($data['sort_order'] ?? 0),
            'status' => 0,
            'has_draft' => 1,
            'draft_data' => json_encode([
                'title' => trim($data['title']),
                'event_date' => $data['event_date'],
                'content' => $data['content'] ?? '',
                'image_url' => $data['image_url'] ?? '',
                'sort_order' => (int)($data['sort_order'] ?? 0),
            ], JSON_UNESCAPED_UNICODE),
            'created_at' => date('Y-m-d H:i:s')
        ]);

        $event = $this->eventModel->findEffective($id);
        $this->logger->info("Life event draft created", ['id' => $id]);

        return Response::success($event, '草稿已保存，请预览确认后发布');
    }

    /**
     * 保存草稿修改（不动已发布内容，前台不受影响）
     */
    public function update(int $id): array
    {
        $event = $this->eventModel->find($id);
        if (!$event) {
            return Response::error('事件不存在', 404);
        }

        $data = json_decode(file_get_contents('php://input'), true) ?? [];

        $validator = new Validator($data);
        $validator->required('title', '标题')
                  ->maxLength('title', 255, '标题')
                  ->required('event_date', '事件日期')
                  ->date('event_date', '事件日期');

        if (!$validator->validate()) {
            return Response::error($validator->getFirstError(), 400);
        }

        // 事件表单暂不提供配图编辑，缺省时保留当前（草稿或已发布）image_url
        $current = $this->eventModel->findEffective($id);
        $imageUrl = $data['image_url'] ?? ($current['effective_image_url'] ?? '');

        $draft = [
            'title' => trim($data['title']),
            'event_date' => $data['event_date'],
            'content' => $data['content'] ?? '',
            'image_url' => $imageUrl,
            'sort_order' => (int)($data['sort_order'] ?? 0),
        ];

        $event = $this->eventModel->saveDraft($id, $draft);
        $this->logger->info("Life event draft saved", ['id' => $id]);

        return Response::success($event, '草稿已保存，请预览确认后发布');
    }

    /**
     * 发布：草稿合并为正式内容，前台立即可见
     */
    public function publish(int $id): array
    {
        $event = $this->eventModel->find($id);
        if (!$event) {
            return Response::error('事件不存在', 404);
        }

        $published = $this->eventModel->publishDraft($id);
        $this->logger->info("Life event published", ['id' => $id]);

        return Response::success($published, '已发布，前台已更新');
    }

    /**
     * 放弃草稿（已发布内容保持不变；从未发布的草稿记录被删除）
     */
    public function discard(int $id): array
    {
        $event = $this->eventModel->find($id);
        if (!$event) {
            return Response::error('事件不存在', 404);
        }

        if ((int)$event['status'] === 0) {
            $this->eventModel->delete($id);
            $this->logger->info("Life event unpublished draft deleted", ['id' => $id]);
            return Response::success(null, '草稿已删除');
        }

        $this->eventModel->clearDraft($id);
        $this->logger->info("Life event draft discarded", ['id' => $id]);
        return Response::success($this->eventModel->find($id), '已放弃草稿修改，恢复为已发布版本');
    }

    /**
     * 生成预览链接令牌
     */
    public function previewToken(int $id): array
    {
        $event = $this->eventModel->find($id);
        if (!$event) {
            return Response::error('事件不存在', 404);
        }

        $token = JWT::generatePreviewToken(['scope' => 'event', 'id' => $id]);
        return Response::success([
            'token' => $token,
            'preview_url' => "/preview?scope=event&id={$id}&preview_token=" . urlencode($token) . "#event-{$id}",
            'expires_in' => JWT::$previewExpireTime,
        ], '预览链接已生成');
    }

    /**
     * 删除事件（已发布内容与草稿一并删除）
     */
    public function delete(int $id): array
    {
        $event = $this->eventModel->find($id);
        if (!$event) {
            return Response::error('事件不存在', 404);
        }

        $this->eventModel->delete($id);
        $this->logger->info("Life event deleted", ['id' => $id]);

        return Response::success(null, '事件删除成功');
    }
}
