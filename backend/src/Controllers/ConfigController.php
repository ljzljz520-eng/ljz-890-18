<?php
/**
 * 网站配置控制器（首页文案：草稿 / 预览 / 发布）
 */

namespace App\Controllers;

use App\Models\SiteConfig;
use App\Utils\Response;
use App\Utils\Logger;
use App\Utils\JWT;

class ConfigController
{
    private SiteConfig $configModel;
    private Logger $logger;

    public function __construct()
    {
        require_once __DIR__ . '/../Models/BaseModel.php';
        require_once __DIR__ . '/../Models/SiteConfig.php';
        $this->configModel = new SiteConfig();
        $this->logger = Logger::getInstance();
    }

    /**
     * 获取公开配置（正式版本，前台/搜索引擎可见）
     */
    public function getPublicConfig(): array
    {
        $config = $this->configModel->getPublicConfig();
        return Response::success($config);
    }

    /**
     * 后台获取配置：正式值 + 草稿合并值 + 草稿键标记
     */
    public function getAll(): array
    {
        $published = $this->configModel->getPublicConfig();
        $draftValues = $this->configModel->getDraftValues();

        // 配置列表（保持原结构，供表单回填；值使用"草稿优先"便于继续编辑）
        $allRows = $this->configModel->all('id', 'ASC');
        foreach ($allRows as &$row) {
            $key = $row['config_key'];
            if (array_key_exists($key, $draftValues)) {
                $row['draft_value'] = $draftValues[$key];
                $row['value'] = $draftValues[$key]; // 草稿优先，回填编辑框
            } else {
                $row['draft_value'] = null;
                $row['value'] = $row['config_value'];
            }
        }
        unset($row);

        return Response::success([
            'configs' => $allRows,
            'published' => $published,
            'drafts' => $draftValues,
            'draft_keys' => array_keys($draftValues),
            'draft_count' => count($draftValues),
        ]);
    }

    /**
     * 保存首页文案草稿（不影响正式配置，前台不变）
     */
    public function update(): array
    {
        $data = json_decode(file_get_contents('php://input'), true) ?? [];

        if (!isset($data['configs']) || !is_array($data['configs'])) {
            return Response::error('配置数据格式错误', 400);
        }

        // 仅允许草稿化实际会在前台展示的文案键，避免误改版权等只读信息
        $allowedKeys = self::EDITABLE_KEYS;

        $draftCount = 0;
        foreach ($data['configs'] as $key => $value) {
            if (!in_array($key, $allowedKeys, true)) {
                continue;
            }
            // 与正式值相同则无需暂存，顺手清理已有草稿
            $publishedValue = $this->configModel->getValue($key);
            if ((string)$publishedValue === (string)$value) {
                $this->configModel->deleteDraft($key);
                continue;
            }
            $this->configModel->saveDraft($key, (string)$value);
            $draftCount++;
        }

        $this->logger->info("Config draft saved", ['draft_keys' => array_keys($this->configModel->getDraftValues())]);

        $remaining = $this->configModel->countDrafts();
        $message = $remaining > 0
            ? "草稿已保存（{$remaining}项待发布），请预览确认后发布"
            : '内容与已发布版本一致，无待发布改动';

        return Response::success(['draft_count' => $remaining], $message);
    }

    /**
     * 发布全部首页文案草稿
     */
    public function publish(): array
    {
        $count = $this->configModel->publishDrafts();
        $this->logger->info("Config drafts published", ['count' => $count]);

        return Response::success(['published_count' => $count], "已发布 {$count} 项首页文案，前台已更新");
    }

    /**
     * 放弃全部首页文案草稿（正式配置不变）
     */
    public function discard(): array
    {
        $count = $this->configModel->discardDrafts();
        $this->logger->info("Config drafts discarded", ['count' => $count]);

        return Response::success(['discarded_count' => $count], "已放弃 {$count} 项草稿修改");
    }

    /**
     * 生成首页文案/整站预览链接令牌
     */
    public function previewToken(): array
    {
        // scope=site 表示整站草稿预览；默认仅首页文案草稿
        $scope = (($_GET['scope'] ?? 'config') === 'site') ? 'site' : 'config';
        $token = JWT::generatePreviewToken(['scope' => $scope]);
        return Response::success([
            'token' => $token,
            'preview_url' => "/preview?scope={$scope}&preview_token=" . urlencode($token) . "#hero",
            'scope' => $scope,
            'expires_in' => JWT::$previewExpireTime,
        ], '预览链接已生成');
    }

    /**
     * 允许在后台编辑/草稿化的前台文案键（与后台配置表单字段保持一致）
     */
    public const EDITABLE_KEYS = [
        'site_title',
        'site_subtitle',
        'father_name',
        'father_name_uyghur',
        'birth_date',
        'death_date',
        'hero_quote',
        'about_text',
        'footer_text',
    ];
}
