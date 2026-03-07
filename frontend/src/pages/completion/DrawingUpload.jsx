/**
 * 竣工图纸上传和管理页面
 * Task 58: 实现竣工图纸上传和管理功能
 * 
 * 功能：
 * - 图纸列表（缩略图显示）
 * - 上传图纸（支持多文件）
 * - 预览图纸
 * - 下载图纸
 */

import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Upload,
  Modal,
  Form,
  Input,
  Select,
  Space,
  message,
  Popconfirm,
  Image,
  Tag,
  Tooltip,
  Row,
  Col,
  Statistic,
  Empty,
  Spin
} from 'antd';
import {
  UploadOutlined,
  DownloadOutlined,
  DeleteOutlined,
  EyeOutlined,
  FileImageOutlined,
  FilePdfOutlined,
  SearchOutlined,
  ReloadOutlined,
  PictureOutlined,
  FolderOutlined
} from '@ant-design/icons';
import axios from 'axios';

const { Option } = Select;
const { TextArea } = Input;

// 图纸类型配置
const DRAWING_TYPES = [
  { value: 'general', label: '总图', color: 'blue' },
  { value: 'architecture', label: '建筑图', color: 'green' },
  { value: 'structure', label: '结构图', color: 'orange' },
  { value: 'mep', label: '机电图', color: 'purple' },
  { value: 'landscape', label: '景观图', color: 'cyan' },
  { value: 'interior', label: '室内图', color: 'magenta' },
  { value: 'other', label: '其他', color: 'default' }
];

// 文件类型图标映射
const FILE_ICONS = {
  'jpg': <FileImageOutlined style={{ fontSize: 24, color: '#52c41a' }} />,
  'jpeg': <FileImageOutlined style={{ fontSize: 24, color: '#52c41a' }} />,
  'png': <FileImageOutlined style={{ fontSize: 24, color: '#1890ff' }} />,
  'pdf': <FilePdfOutlined style={{ fontSize: 24, color: '#f5222d' }} />
};

const DrawingUpload = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [drawings, setDrawings] = useState([]);
  const [projects, setProjects] = useState([]);
  const [stats, setStats] = useState(null);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0
  });
  
  // 筛选条件
  const [filters, setFilters] = useState({
    project_id: null,
    drawing_type: null,
    keyword: ''
  });
  
  // 弹窗状态
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [previewDrawing, setPreviewDrawing] = useState(null);
  const [fileList, setFileList] = useState([]);
  
  // 视图模式：list | grid
  const [viewMode, setViewMode] = useState('grid');

  // 加载图纸列表
  const loadDrawings = async (page = 1, pageSize = 20) => {
    setLoading(true);
    try {
      const params = {
        page,
        pageSize,
        ...filters
      };
      
      // 移除空值参数
      Object.keys(params).forEach(key => {
        if (params[key] === null || params[key] === '' || params[key] === undefined) {
          delete params[key];
        }
      });
      
      const response = await axios.get('/api/completion/drawings', { params });
      
      if (response.data.success) {
        setDrawings(response.data.data);
        setPagination({
          current: response.data.pagination.page,
          pageSize: response.data.pagination.pageSize,
          total: response.data.pagination.total
        });
      }
    } catch (error) {
      console.error('加载图纸列表失败:', error);
      message.error('加载图纸列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 加载项目列表
  const loadProjects = async () => {
    try {
      const response = await axios.get('/api/completion/drawings/projects/list');
      if (response.data.success) {
        setProjects(response.data.data);
      }
    } catch (error) {
      console.error('加载项目列表失败:', error);
    }
  };

  // 加载统计数据
  const loadStats = async () => {
    try {
      const params = filters.project_id ? { project_id: filters.project_id } : {};
      const response = await axios.get('/api/completion/drawings/stats/overview', { params });
      if (response.data.success) {
        setStats(response.data.data);
      }
    } catch (error) {
      console.error('加载统计数据失败:', error);
    }
  };

  // 初始加载
  useEffect(() => {
    loadDrawings();
    loadProjects();
    loadStats();
  }, []);

  // 筛选变化时重新加载
  useEffect(() => {
    loadDrawings(1, pagination.pageSize);
    loadStats();
  }, [filters]);

  // 处理上传
  const handleUpload = async () => {
    try {
      const values = await form.validateFields();
      
      if (fileList.length === 0) {
        message.warning('请选择要上传的图纸文件');
        return;
      }
      
      const formData = new FormData();
      formData.append('project_id', values.project_id);
      formData.append('drawing_type', values.drawing_type || 'general');
      if (values.remark) {
        formData.append('remark', values.remark);
      }
      
      fileList.forEach(file => {
        formData.append('files', file.originFileObj || file);
      });
      
      const response = await axios.post('/api/completion/drawings', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      if (response.data.success) {
        message.success(response.data.message);
        setUploadModalVisible(false);
        setFileList([]);
        form.resetFields();
        loadDrawings();
        loadStats();
        loadProjects();
      }
    } catch (error) {
      console.error('上传失败:', error);
      if (error.response?.data?.message) {
        message.error(error.response.data.message);
      } else {
        message.error('上传失败');
      }
    }
  };

  // 处理删除
  const handleDelete = async (id) => {
    try {
      const response = await axios.delete(`/api/completion/drawings/${id}`);
      if (response.data.success) {
        message.success('删除成功');
        loadDrawings(pagination.current, pagination.pageSize);
        loadStats();
      }
    } catch (error) {
      console.error('删除失败:', error);
      message.error(error.response?.data?.message || '删除失败');
    }
  };

  // 处理下载
  const handleDownload = (drawing) => {
    const token = localStorage.getItem('token');
    const url = `/api/completion/drawings/${drawing.id}/download?token=${token}`;
    window.open(url, '_blank');
  };

  // 预览图纸
  const handlePreview = (drawing) => {
    setPreviewDrawing(drawing);
    setPreviewModalVisible(true);
  };

  // 上传前验证
  const beforeUpload = (file) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    const isAllowed = allowedTypes.includes(file.type);
    
    if (!isAllowed) {
      message.error('仅支持 JPG、PNG、PDF 格式的文件');
      return Upload.LIST_IGNORE;
    }
    
    const isLt50M = file.size / 1024 / 1024 < 50;
    if (!isLt50M) {
      message.error('文件大小不能超过 50MB');
      return Upload.LIST_IGNORE;
    }
    
    return false; // 阻止自动上传
  };

  // 获取文件图标
  const getFileIcon = (filePath) => {
    if (!filePath) return <FileImageOutlined style={{ fontSize: 24 }} />;
    const ext = filePath.split('.').pop().toLowerCase();
    return FILE_ICONS[ext] || <FileImageOutlined style={{ fontSize: 24 }} />;
  };

  // 获取图纸类型标签
  const getDrawingTypeTag = (type) => {
    const typeConfig = DRAWING_TYPES.find(t => t.value === type) || DRAWING_TYPES[6];
    return <Tag color={typeConfig.color}>{typeConfig.label}</Tag>;
  };

  // 表格列定义
  const columns = [
    {
      title: '缩略图',
      dataIndex: 'file_path',
      key: 'thumbnail',
      width: 80,
      render: (text, record) => {
        const ext = text?.split('.').pop().toLowerCase();
        if (['jpg', 'jpeg', 'png'].includes(ext)) {
          return (
            <Image
              src={`/uploads/${record.thumbnail_url}`}
              width={50}
              height={50}
              style={{ objectFit: 'cover', borderRadius: 4, cursor: 'pointer' }}
              fallback="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
              preview={false}
              onClick={() => handlePreview(record)}
            />
          );
        }
        return (
          <div 
            style={{ width: 50, height: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5', borderRadius: 4 }}
            onClick={() => handlePreview(record)}
          >
            {getFileIcon(text)}
          </div>
        );
      }
    },
    {
      title: '图纸名称',
      dataIndex: 'drawing_name',
      key: 'drawing_name',
      ellipsis: true
    },
    {
      title: '关联项目',
      dataIndex: 'project_name',
      key: 'project_name',
      ellipsis: true,
      render: (text, record) => (
        <Tooltip title={`${record.project_no} - ${text}`}>
          <span>{text}</span>
        </Tooltip>
      )
    },
    {
      title: '图纸类型',
      dataIndex: 'drawing_type',
      key: 'drawing_type',
      width: 100,
      render: (type) => getDrawingTypeTag(type)
    },
    {
      title: '文件大小',
      dataIndex: 'file_size_formatted',
      key: 'file_size',
      width: 100
    },
    {
      title: '上传人',
      dataIndex: 'uploader_name',
      key: 'uploader_name',
      width: 100
    },
    {
      title: '上传日期',
      dataIndex: 'upload_date',
      key: 'upload_date',
      width: 120
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_, record) => (
        <Space>
          <Tooltip title="预览">
            <Button
              type="link"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => handlePreview(record)}
            />
          </Tooltip>
          <Tooltip title="下载">
            <Button
              type="link"
              size="small"
              icon={<DownloadOutlined />}
              onClick={() => handleDownload(record)}
            />
          </Tooltip>
          <Popconfirm
            title="确定删除此图纸吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Tooltip title="删除">
              <Button
                type="link"
                size="small"
                danger
                icon={<DeleteOutlined />}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      )
    }
  ];

  // 渲染网格视图
  const renderGridView = () => (
    <Row gutter={[16, 16]}>
      {drawings.map(drawing => {
        const ext = drawing.file_path?.split('.').pop().toLowerCase();
        const isImage = ['jpg', 'jpeg', 'png'].includes(ext);
        
        return (
          <Col xs={24} sm={12} md={8} lg={6} xl={4} key={drawing.id}>
            <Card
              hoverable
              className="drawing-card"
              cover={
                <div 
                  style={{ 
                    height: 150, 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    background: '#f5f5f5',
                    overflow: 'hidden'
                  }}
                >
                  {isImage ? (
                    <Image
                      src={`/uploads/${drawing.thumbnail_url}`}
                      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                      preview={false}
                      onClick={() => handlePreview(drawing)}
                    />
                  ) : (
                    <div onClick={() => handlePreview(drawing)} style={{ cursor: 'pointer' }}>
                      {getFileIcon(drawing.file_path)}
                      <div style={{ marginTop: 8, color: '#999' }}>PDF文件</div>
                    </div>
                  )}
                </div>
              }
              actions={[
                <EyeOutlined key="preview" onClick={() => handlePreview(drawing)} />,
                <DownloadOutlined key="download" onClick={() => handleDownload(drawing)} />,
                <Popconfirm
                  key="delete"
                  title="确定删除此图纸吗？"
                  onConfirm={() => handleDelete(drawing.id)}
                  okText="确定"
                  cancelText="取消"
                >
                  <DeleteOutlined style={{ color: '#ff4d4f' }} />
                </Popconfirm>
              ]}
            >
              <Card.Meta
                title={
                  <Tooltip title={drawing.drawing_name}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {drawing.drawing_name}
                    </div>
                  </Tooltip>
                }
                description={
                  <div>
                    <div style={{ marginBottom: 4 }}>
                      {getDrawingTypeTag(drawing.drawing_type)}
                    </div>
                    <div style={{ fontSize: 12, color: '#999' }}>
                      {drawing.project_name}
                    </div>
                    <div style={{ fontSize: 12, color: '#999' }}>
                      {drawing.file_size_formatted} · {drawing.upload_date}
                    </div>
                  </div>
                }
              />
            </Card>
          </Col>
        );
      })}
    </Row>
  );

  return (
    <div className="drawing-upload-page">
      {/* 统计卡片 */}
      {stats && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col xs={12} sm={6}>
            <Card>
              <Statistic
                title="图纸总数"
                value={stats.total}
                prefix={<FolderOutlined />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card>
              <Statistic
                title="存储空间"
                value={stats.totalSizeFormatted}
                prefix={<PictureOutlined />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card>
              <Statistic
                title="关联项目"
                value={stats.projectStats?.length || 0}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card>
              <Statistic
                title="图纸类型"
                value={stats.typeStats?.length || 0}
              />
            </Card>
          </Col>
        </Row>
      )}
      
      {/* 主内容卡片 */}
      <Card
        title={
          <Space>
            <span>竣工图纸管理</span>
            <Button
              type="primary"
              icon={<UploadOutlined />}
              onClick={() => setUploadModalVisible(true)}
            >
              上传图纸
            </Button>
          </Space>
        }
        extra={
          <Space>
            <Select
              placeholder="选择项目"
              allowClear
              style={{ width: 200 }}
              value={filters.project_id}
              onChange={(value) => setFilters({ ...filters, project_id: value })}
            >
              {projects.map(p => (
                <Option key={p.id} value={p.id}>
                  {p.project_no} - {p.name}
                </Option>
              ))}
            </Select>
            <Select
              placeholder="图纸类型"
              allowClear
              style={{ width: 120 }}
              value={filters.drawing_type}
              onChange={(value) => setFilters({ ...filters, drawing_type: value })}
            >
              {DRAWING_TYPES.map(t => (
                <Option key={t.value} value={t.value}>{t.label}</Option>
              ))}
            </Select>
            <Input.Search
              placeholder="搜索图纸名称"
              allowClear
              style={{ width: 200 }}
              value={filters.keyword}
              onChange={(e) => setFilters({ ...filters, keyword: e.target.value })}
              onSearch={(value) => setFilters({ ...filters, keyword: value })}
            />
            <Button
              icon={<ReloadOutlined />}
              onClick={() => loadDrawings(pagination.current, pagination.pageSize)}
            />
          </Space>
        }
      >
        <Spin spinning={loading}>
          {drawings.length === 0 ? (
            <Empty description="暂无图纸" />
          ) : viewMode === 'grid' ? (
            <>
              {renderGridView()}
              <div style={{ marginTop: 16, textAlign: 'right' }}>
                <Space>
                  <span>共 {pagination.total} 条</span>
                  <Button
                    disabled={pagination.current <= 1}
                    onClick={() => loadDrawings(pagination.current - 1, pagination.pageSize)}
                  >
                    上一页
                  </Button>
                  <span>第 {pagination.current} 页</span>
                  <Button
                    disabled={pagination.current * pagination.pageSize >= pagination.total}
                    onClick={() => loadDrawings(pagination.current + 1, pagination.pageSize)}
                  >
                    下一页
                  </Button>
                </Space>
              </div>
            </>
          ) : (
            <Table
              columns={columns}
              dataSource={drawings}
              rowKey="id"
              pagination={{
                ...pagination,
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (total) => `共 ${total} 条`
              }}
              onChange={(p) => loadDrawings(p.current, p.pageSize)}
            />
          )}
        </Spin>
      </Card>
      
      {/* 上传弹窗 */}
      <Modal
        title="上传竣工图纸"
        open={uploadModalVisible}
        onCancel={() => {
          setUploadModalVisible(false);
          setFileList([]);
          form.resetFields();
        }}
        onOk={handleUpload}
        width={600}
        okText="上传"
        cancelText="取消"
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ drawing_type: 'general' }}
        >
          <Form.Item
            name="project_id"
            label="关联项目"
            rules={[{ required: true, message: '请选择关联项目' }]}
          >
            <Select
              placeholder="请选择关联项目"
              showSearch
              optionFilterProp="children"
            >
              {projects.map(p => (
                <Option key={p.id} value={p.id}>
                  {p.project_no} - {p.name}
                </Option>
              ))}
            </Select>
          </Form.Item>
          
          <Form.Item
            name="drawing_type"
            label="图纸类型"
          >
            <Select placeholder="请选择图纸类型">
              {DRAWING_TYPES.map(t => (
                <Option key={t.value} value={t.value}>{t.label}</Option>
              ))}
            </Select>
          </Form.Item>
          
          <Form.Item
            label="图纸文件"
            required
            extra="支持 JPG、PNG、PDF 格式，单个文件不超过 50MB，最多同时上传 20 个文件"
          >
            <Upload
              multiple
              fileList={fileList}
              beforeUpload={beforeUpload}
              onChange={({ fileList }) => setFileList(fileList)}
              accept=".jpg,.jpeg,.png,.pdf"
            >
              <Button icon={<UploadOutlined />}>选择文件</Button>
            </Upload>
          </Form.Item>
          
          <Form.Item
            name="remark"
            label="备注"
          >
            <TextArea rows={3} placeholder="请输入备注信息" />
          </Form.Item>
        </Form>
      </Modal>
      
      {/* 预览弹窗 */}
      <Modal
        title={previewDrawing?.drawing_name}
        open={previewModalVisible}
        onCancel={() => {
          setPreviewModalVisible(false);
          setPreviewDrawing(null);
        }}
        footer={[
          <Button key="download" icon={<DownloadOutlined />} onClick={() => previewDrawing && handleDownload(previewDrawing)}>
            下载图纸
          </Button>,
          <Button key="close" onClick={() => setPreviewModalVisible(false)}>
            关闭
          </Button>
        ]}
        width={800}
        centered
      >
        {previewDrawing && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <Space>
                {getDrawingTypeTag(previewDrawing.drawing_type)}
                <span>文件大小: {previewDrawing.file_size_formatted}</span>
                <span>上传人: {previewDrawing.uploader_name}</span>
                <span>上传日期: {previewDrawing.upload_date}</span>
              </Space>
            </div>
            {previewDrawing.remark && (
              <div style={{ marginBottom: 16, color: '#666' }}>
                备注: {previewDrawing.remark}
              </div>
            )}
            <div style={{ textAlign: 'center', background: '#f5f5f5', padding: 20, borderRadius: 8 }}>
              {['jpg', 'jpeg', 'png'].includes(previewDrawing.file_path?.split('.').pop().toLowerCase()) ? (
                <Image
                  src={`/uploads/${previewDrawing.thumbnail_url}`}
                  style={{ maxWidth: '100%', maxHeight: 500 }}
                />
              ) : (
                <div style={{ padding: 40 }}>
                  <FilePdfOutlined style={{ fontSize: 80, color: '#f5222d' }} />
                  <div style={{ marginTop: 16, color: '#999' }}>
                    PDF 文件，请点击下载按钮查看
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
      
      {/* 样式 */}
      <style jsx global>{`
        .drawing-upload-page .drawing-card {
          height: 100%;
        }
        .drawing-upload-page .drawing-card .ant-card-cover {
          cursor: pointer;
        }
        .drawing-upload-page .drawing-card .ant-card-meta-title {
          font-size: 14px;
        }
        .drawing-upload-page .ant-card-actions > li {
          margin: 8px 0;
        }
      `}</style>
    </div>
  );
};

export default DrawingUpload;
