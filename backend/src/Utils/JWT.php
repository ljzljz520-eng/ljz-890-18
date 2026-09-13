<?php
/**
 * JWT工具类
 */

namespace App\Utils;

class JWT
{
    private static string $secretKey = 'memorial_website_secret_key_2024_yiningyun';
    private static int $expireTime = 86400; // 24小时

    /**
     * 预览链接 token 有效期：7天
     */
    public static int $previewExpireTime = 604800;

    /**
     * 生成Token
     */
    public static function generate(array $payload): string
    {
        return self::buildToken($payload, self::$expireTime);
    }

    /**
     * 生成预览链接专用Token（带 scope/id 声明，7天有效）
     */
    public static function generatePreviewToken(array $scope = [], int $ttl = null): string
    {
        $payload = array_merge(['typ' => 'preview'], $scope);
        return self::buildToken($payload, $ttl ?? self::$previewExpireTime);
    }

    private static function buildToken(array $payload, int $ttl): string
    {
        $header = [
            'typ' => 'JWT',
            'alg' => 'HS256'
        ];

        $payload['iat'] = time();
        $payload['exp'] = time() + $ttl;

        $headerEncoded = self::base64UrlEncode(json_encode($header));
        $payloadEncoded = self::base64UrlEncode(json_encode($payload));

        $signature = hash_hmac('sha256', "{$headerEncoded}.{$payloadEncoded}", self::$secretKey, true);
        $signatureEncoded = self::base64UrlEncode($signature);

        return "{$headerEncoded}.{$payloadEncoded}.{$signatureEncoded}";
    }
    
    /**
     * 验证Token
     */
    public static function verify(string $token): ?array
    {
        $parts = explode('.', $token);
        
        if (count($parts) !== 3) {
            return null;
        }
        
        [$headerEncoded, $payloadEncoded, $signatureEncoded] = $parts;
        
        // 验证签名
        $signature = self::base64UrlDecode($signatureEncoded);
        $expectedSignature = hash_hmac('sha256', "{$headerEncoded}.{$payloadEncoded}", self::$secretKey, true);
        
        if (!hash_equals($expectedSignature, $signature)) {
            return null;
        }
        
        // 解析payload
        $payload = json_decode(self::base64UrlDecode($payloadEncoded), true);
        
        if (!$payload) {
            return null;
        }
        
        // 检查是否过期
        if (isset($payload['exp']) && $payload['exp'] < time()) {
            return null;
        }
        
        return $payload;
    }
    
    /**
     * 从请求头获取Token
     */
    public static function getTokenFromHeader(): ?string
    {
        $headers = getallheaders();
        $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';

        if (preg_match('/Bearer\s+(.+)$/i', $authHeader, $matches)) {
            return $matches[1];
        }

        return null;
    }

    /**
     * 获取请求中的Token：优先 Authorization 头，其次 preview_token 查询参数
     * （预览页面在新标签打开，无法携带自定义请求头）
     */
    public static function getTokenFromRequest(): ?string
    {
        return self::getTokenFromHeader()
            ?? ($_GET['preview_token'] ?? null)
            ?? null;
    }
    
    /**
     * Base64 URL编码
     */
    private static function base64UrlEncode(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }
    
    /**
     * Base64 URL解码
     */
    private static function base64UrlDecode(string $data): string
    {
        return base64_decode(strtr($data, '-_', '+/'));
    }
}
