<?php
/**
 * 预览控制器
 *
 * 提供"接近前台"的整站预览数据：在有效预览 token（或管理员 token）授权下，
 * 返回把草稿合并到正式内容后的整站数据。无有效 token 一律拒绝，
 * 保证草稿既不会被公开访问，也不会被搜索引擎收录。
 */

namespace App\Controllers;

use App\Models\SiteConfig;
use App\Models\LifeEvent;
use App\Models\Photo;
use App\Models\Message;
use App\Utils\Response;
use App\Utils\Logger;

class PreviewController
{
    private SiteConfig $configModel;
    private LifeEvent $eventModel;
    private Photo $photoModel;
    private Message $messageModel;
    private Logger $logger;

    public function __construct()
    {
        require_once __DIR__ . '/../Models/BaseModel.php';
        require_once __DIR__ . '/../Models/SiteConfig.php';
        require_once __DIR__ . '/../Models/LifeEvent.php';
        require_once __DIR__ . '/../Models/Photo.php';
        require_once __DIR__ . '/../Models/Message.php';

        $this->configModel = new SiteConfig();
        $this->eventModel = new LifeEvent();
        $this->photoModel = new Photo();
        $this->messageModel = new Message();
        $this->logger = Logger::getInstance();
    }

    /**
     * 整站预览（合并草稿）
     * 查询参数：scope=site|config|event|photo&id=xx
     */
    public function site(): array
    {
        // 预览接口禁止缓存，防止草稿被中间层缓存泄漏
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
        header('Pragma: no-cache');
        // 双保险：接口层也要求搜索引擎不收录
        header('X-Robots-Tag: noindex, nofollow, noarchive');

        $scope = $_GET['scope'] ?? 'site';
        $id = isset($_GET['id']) ? (int)$_GET['id'] : null;

        // 默认整站合并全部草稿
        $config = $this->configModel->getMergedConfig();
        $events = $this->previewEvents($scope, $id);
        $photos = $this->previewPhotos($scope, $id);

        // 寄语不属于"文章/照片/首页文案"编辑范围，预览中展示已通过内容
        $messages = $this->messageModel->getApproved();

        // 所有待发布草稿ID，供预览页"一键发布全部"
        $draftEventStmt = $this->eventModel->getAllForAdmin();
        $draftPhotoStmt = $this->photoModel->getAllForAdmin();
        $draftEventIds = array_values(array_map(
            fn($r) => (int)$r['id'],
            array_filter($draftEventStmt, fn($r) => (int)$r['has_draft'] === 1)
        ));
        $draftPhotoIds = array_values(array_map(
            fn($r) => (int)$r['id'],
            array_filter($draftPhotoStmt, fn($r) => (int)$r['has_draft'] === 1)
        ));

        $draftCounts = [
            'events' => count($draftEventIds),
            'photos' => count($draftPhotoIds),
            'config' => $this->configModel->countDrafts(),
        ];

        return Response::success([
            'scope' => $scope,
            'id' => $id,
            'config' => $config,
            'life_events' => $events,
            'photos' => $photos,
            'messages' => $messages,
            'draft_counts' => $draftCounts,
            'draft_ids' => [
                'events' => $draftEventIds,
                'photos' => $draftPhotoIds,
            ],
            'preview' => true,
        ], '预览数据');
    }

    /**
     * 在预览页确认后发布（仅预览 token 授权，权限范围由 token 的 scope 限定）
     * POST /preview/publish
     */
    public function publish(): array
    {
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

        $claims = $GLOBALS['previewClaims'] ?? [];
        // 管理员 token（无 typ=preview 声明）可发布任意范围；预览 token 受 scope 限制
        $isPreviewToken = ($claims['typ'] ?? null) === 'preview';
        $tokenScope = $claims['scope'] ?? 'site';
        $tokenId = isset($claims['id']) ? (int)$claims['id'] : null;

        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $scope = $data['scope'] ?? $tokenScope;
        $id = isset($data['id']) ? (int)$data['id'] : $tokenId;

        if ($isPreviewToken) {
            // 范围校验：单内容 token 只能发布对应内容
            if (in_array($tokenScope, ['event', 'photo'], true)) {
                if ($scope !== $tokenScope || $id !== $tokenId) {
                    http_response_code(403);
                    return Response::error('该预览链接只能发布对应的' . ($tokenScope === 'event' ? '事件' : '照片'), 403);
                }
            } elseif ($tokenScope === 'config' && $scope !== 'config') {
                http_response_code(403);
                return Response::error('该预览链接只能发布首页文案', 403);
            }
        }

        $published = [];

        switch ($scope) {
            case 'event':
                if (!$id) return Response::error('缺少事件ID', 400);
                $this->eventModel->publishDraft($id);
                $published['events'] = 1;
                break;

            case 'photo':
                if (!$id) return Response::error('缺少照片ID', 400);
                $this->photoModel->publishDraft($id);
                $published['photos'] = 1;
                break;

            case 'config':
                $published['config'] = $this->configModel->publishDrafts();
                break;

            case 'site':
            default:
                // 整站发布：首页文案 + 所有事件/照片草稿
                $published['config'] = $this->configModel->publishDrafts();
                $published['events'] = $this->eventModel->publishAllDrafts();
                $published['photos'] = $this->photoModel->publishAllDrafts();
                break;
        }

        $this->logger->info("Preview publish", ['scope' => $scope, 'id' => $id, 'result' => $published]);

        return Response::success(['published' => $published], '已发布，前台已更新');
    }

    /**
     * 按预览范围计算事件列表
     */
    private function previewEvents(string $scope, ?int $id): array
    {
        if ($scope === 'photo' || $scope === 'config') {
            // 预览照片/文案时，事件不叠加草稿
            return $this->eventModel->getPublishedSorted();
        }

        if ($scope === 'event' && $id) {
            // 单事件预览：已发布事件 + 该事件草稿版本（草稿排到该记录的位置）
            $list = $this->eventModel->getPublishedSorted();
            $target = $this->eventModel->findEffective($id);
            if (!$target) {
                return $list;
            }
            $target = $this->normalizeEvent($target);
            $found = false;
            foreach ($list as $i => $row) {
                if ((int)$row['id'] === $id) {
                    $list[$i] = $target; // 用草稿版本替换已发布版本
                    $found = true;
                    break;
                }
            }
            if (!$found) {
                // 从未发布的新草稿，按日期插入
                $list[] = $target;
                usort($list, function ($a, $b) {
                    $cmp = strcmp($a['event_date'], $b['event_date']);
                    return $cmp !== 0 ? $cmp : ((int)$a['sort_order'] <=> (int)$b['sort_order']);
                });
            }
            return $list;
        }

        // 整站预览：所有记录（草稿版替换/新增），按发布后顺序排列，归一化为前台字段结构
        $list = $this->eventModel->getAllForPreview();
        return array_values(array_map(fn($row) => $this->normalizeEvent($row), $list));
    }

    /**
     * 把 effective_* 草稿预览字段归一化为正式字段，供前台直接渲染
     */
    private function normalizeEvent(array $row): array
    {
        foreach (['title', 'event_date', 'content', 'image_url', 'sort_order'] as $f) {
            if (array_key_exists('effective_' . $f, $row)) {
                $row[$f] = $row['effective_' . $f];
            }
        }
        return $row;
    }

    /**
     * 按预览范围计算照片列表
     */
    private function previewPhotos(string $scope, ?int $id): array
    {
        if ($scope === 'event' || $scope === 'config') {
            return $this->photoModel->getPublishedSorted();
        }

        if ($scope === 'photo' && $id) {
            $list = $this->photoModel->getPublishedSorted();
            $target = $this->photoModel->findEffective($id);
            if (!$target) {
                return $list;
            }
            $target = $this->normalizePhoto($target);
            $found = false;
            foreach ($list as $i => $row) {
                if ((int)$row['id'] === $id) {
                    $list[$i] = $target;
                    $found = true;
                    break;
                }
            }
            if (!$found) {
                $list[] = $target;
                usort($list, fn($a, $b) => (int)$a['sort_order'] <=> (int)$b['sort_order']);
            }
            return $list;
        }

        $list = $this->photoModel->getAllForPreview();
        return array_values(array_map(fn($row) => $this->normalizePhoto($row), $list));
    }

    /**
     * 把 effective_* 草稿预览字段归一化为正式字段，供前台直接渲染
     */
    private function normalizePhoto(array $row): array
    {
        foreach (['title', 'image_url', 'description', 'sort_order'] as $f) {
            if (array_key_exists('effective_' . $f, $row)) {
                $row[$f] = $row['effective_' . $f];
            }
        }
        return $row;
    }
}
