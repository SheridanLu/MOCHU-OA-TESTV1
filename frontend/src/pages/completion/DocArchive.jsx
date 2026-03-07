import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Input,
  Select,
  Upload,
  Modal,
  message,
  Popconfirm,
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
  SearchOutlined,
  FileTextOutlined,
  FolderOutlined,
  ReloadOutlined,
  EyeOutlined,
  FilePdfOutlined,
  FileWordOutlined,
  FileExcelOutlined,
  FileImageOutlined,
  FileZipOutlined,
  FileUnknownOutlined
} from '@ant-design/icons';
import axios from 'axios';

const { Search } = Input;
const { Option } = Select;
const { Dragger } = Upload;

/**
 * 文档归档管理页面
 * Task 59: 实现竣工管理 - 文档归档
 */
const DocArchive = () => {
  // 状态定义
  const [loading, setLoading] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [projects, setProjects] = useState([]);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0
  });
  const [filters, setFilters] = useState({
    project_id: null,
    doc_type: null,
    keyword: ''
  });
  const [stats, setStats] = useState({
    total: 0,
    totalSizeFormatted: '0 B',
    typeStats: []
  });
  
  // 弹窗状态
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [currentDoc, setCurrentDoc] = useState(null);
  const [fileList, setFileList] = useState([]);
  const [uploading, setUploading] = useState(false);
  
  // 文档类型定义
  const docTypes = [
    { value: 'contract', label: '合同文件', color: 'blue' },
    { value: 'technical', label: '技术文档', color: 'green' },
    { value: 'construction', label: '施工记录', color: 'orange' },
    { value: 'acceptance', label: '验收报告', color: 'purple' },
    { value: 'other', label: '其他', color: 'default' }
  ];
  
  // 文档类型映射
  const docTypeMap = docTypes.reduce((acc, item) => {
    acc[item.value] = item;
    return acc;
  }, {});
  
  // 初始化
  useEffect(() => {
    fetchDocuments();
    fetchProjects();
    fetchStats();
  }, []);
  
  // 获取文档列表
  const fetchDocuments = async (page = 1, pageSize = 20) => {
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
      
      const response = await axios.get('/api/completion/documents', { params });
      
      if (response.data.success) {
        setDocuments(response.data.data);
        setPagination({
          current: response.data.pagination.page,
          pageSize: response.data.pagination.pageSize,
          total: response.data.pagination.total
        });
      }
    } catch (error) {
      console.error('获取文档列表失败:', error);
      message.error('获取文档列表失败');
    } finally {
      setLoading(false);
    }
  };
  
  // 获取项目列表
  const fetchProjects = async () => {
    try {
      const response = await axios.get('/api/completion/documents/projects/list');
      if (response.data.success) {
        setProjects(response.data.data);
      }
    } catch (error) {
      console.error('获取项目列表失败:', error);
    }
  };
  
  // 获取统计数据
  const fetchStats = async () => {
    try {
      const params = {};
      if (filters.project_id) {
        params.project_id = filters.project_id;
      }
      
      const response = await axios.get('/api/completion/documents/stats/overview', { params });
      
      if (response.data.success) {
        setStats(response.data.data);
      }
    } catch (error) {
      console.error('获取统计数据失败:', error);
    }
  };
  
  // 处理表格变化
  const handleTableChange = (pagination) => {
    fetchDocuments(pagination.current, pagination.pageSize);
  };
  
  // 处理筛选
  const handleFilter = () => {
    fetchDocuments(1, pagination.pageSize);
    fetchStats();
  };
  
  // 重置筛选
  const handleReset = () => {
    setFilters({
      project_id: null,
      doc_type: null,
      keyword: ''
    });
    setTimeout(() => {
      fetchDocuments(1, pagination.pageSize);
      fetchStats();
    }, 0);
  };
  
  // 打开上传弹窗
  const handleUpload = () => {
    setFileList([]);
    setUploadModalVisible(true);
  };
  
  // 上传前校验
  const beforeUpload = (file) => {
    // 100MB 限制
    const isLt100M = file.size / 1024 / 1024 < 100;
    if (!isLt100M) {
      message.error('文件大小不能超过 100MB');
      return false;
    }
    return true;
  };
  
  // 提交上传
  const handleUploadSubmit = async (values) => {
    if (fileList.length === 0) {
      message.warning('请选择要上传的文档');
      return;
    }
    
    if (!values.project_id) {
      message.warning('请选择关联项目');
      return;
    }
    
    setUploading(true);
    
    const formData = new FormData();
    formData.append('project_id', values.project_id);
    formData.append('doc_type', values.doc_type || 'other');
    if (values.remark) {
      formData.append('remark', values.remark);
    }
    
    fileList.forEach(file => {
      formData.append('files', file);
    });
    
    try {
      const response = await axios.post('/api/completion/documents', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      if (response.data.success) {
        message.success(response.data.message);
        setUploadModalVisible(false);
        setFileList([]);
        fetchDocuments(1, pagination.pageSize);
        fetchStats();
        fetchProjects();
      } else {
        message.error(response.data.message || '上传失败');
      }
    } catch (error) {
      console.error('上传失败:', error);
      message.error(error.response?.data?.message || '上传失败');
    } finally {
      setUploading(false);
    }
  };
  
  // 删除文档
  const handleDelete = async (id) => {
    try {
      const response = await axios.delete(`/api/completion/documents/${id}`);
      
      if (response.data.success) {
        message.success('删除成功');
        fetchDocuments(pagination.current, pagination.pageSize);
        fetchStats();
      } else {
        message.error(response.data.message || '删除失败');
      }
    } catch (error) {
      console.error('删除失败:', error);
      message.error(error.response?.data?.message || '删除失败');
    }
  };
  
  // 下载文档
  const handleDownload = (record) => {
    const token = localStorage.getItem('token');
    const url = `/api/completion/documents/${record.id}/download?token=${token}`;
    window.open(url, '_blank');
  };
  
  // 查看详情
  const handleViewDetail = async (id) => {
    try {
      const response = await axios.get(`/api/completion/documents/${id}`);
      
      if (response.data.success) {
        setCurrentDoc(response.data.data);
        setDetailModalVisible(true);
      }
    } catch (error) {
      console.error('获取详情失败:', error);
      message.error('获取详情失败');
    }
  };
  
  // 获取文件图标
  const getFileIcon = (filePath) => {
    if (!filePath) return <FileUnknownOutlined />;
    
    const ext = filePath.split('.').pop().toLowerCase();
    
    switch (ext) {
      case 'pdf':
        return <FilePdfOutlined style={{ color: '#f5222d' }} />;
      case 'doc':
      case 'docx':
        return <FileWordOutlined style={{ color: '#1890ff' }} />;
      case 'xls':
      case 'xlsx':
        return <FileExcelOutlined style={{ color: '#52c41a' }} />;
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
        return <FileImageOutlined style={{ color: '#faad14' }} />;
      case 'zip':
      case 'rar':
        return <FileZipOutlined style={{ color: '#722ed1' }} />;
      default:
        return <FileTextOutlined style={{ color: '#666' }} />;
    }
  };
  
  // 表格列定义
  const columns = [
    {
      title: '文档名称',
      dataIndex: 'doc_name',
      key: 'doc_name',
      width: 250,
      ellipsis: true,
      render: (text, record) => (
        <Space>
          {getFileIcon(record.file_path)}
          <Tooltip title={text}>
            <span>{text}</span>
          </Tooltip>
        </Space>
      )
    },
    {
      title: '关联项目',
      dataIndex: 'project_name',
      key: 'project_name',
      width: 200,
      ellipsis: true,
      render: (text, record) => (
        <Tooltip title={`${record.project_no} - ${text}`}>
          <span>{text}</span>
        </Tooltip>
      )
    },
    {
      title: '文档分类',
      dataIndex: 'doc_type',
      key: 'doc_type',
      width: 120,
      render: (type) => {
        const typeInfo = docTypeMap[type] || { label: type, color: 'default' };
        return <Tag color={typeInfo.color}>{typeInfo.label}</Tag>;
      }
    },
    {
      title: '文件大小',
      dataIndex: 'file_size_formatted',
      key: 'file_size_formatted',
      width: 100,
      align: 'right'
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
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
      width: 150,
      ellipsis: true,
      render: (text) => text || '-'
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      fixed: 'right',
      render: (_, record) => (
        <Space>
          <Tooltip title="查看详情">
            <Button
              type="link"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => handleViewDetail(record.id)}
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
            title="确定要删除此文档吗？"
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
  
  // 渲染统计卡片
  const renderStatsCards = () => (
    <Row gutter={16} style={{ marginBottom: 16 }}>
      <Col span={6}>
        <Card>
          <Statistic
            title="文档总数"
            value={stats.total}
            prefix={<FolderOutlined />}
          />
        </Card>
      </Col>
      <Col span={6}>
        <Card>
          <Statistic
            title="存储空间"
            value={stats.totalSizeFormatted}
            prefix={<FileTextOutlined />}
          />
        </Card>
      </Col>
      {stats.typeStats && stats.typeStats.slice(0, 4).map(stat => {
        const typeInfo = docTypeMap[stat.doc_type] || { label: stat.doc_type, color: 'default' };
        return (
          <Col span={3} key={stat.doc_type}>
            <Card>
              <Statistic
                title={<Tag color={typeInfo.color}>{typeInfo.label}</Tag>}
                value={stat.count}
              />
            </Card>
          </Col>
        );
      })}
    </Row>
  );
  
  return (
    <div className="doc-archive-page">
      {/* 统计卡片 */}
      {renderStatsCards()}
      
      {/* 主卡片 */}
      <Card>
        {/* 筛选区域 */}
        <div style={{ marginBottom: 16 }}>
          <Space wrap>
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
              placeholder="文档分类"
              allowClear
              style={{ width: 150 }}
              value={filters.doc_type}
              onChange={(value) => setFilters({ ...filters, doc_type: value })}
            >
              {docTypes.map(type => (
                <Option key={type.value} value={type.value}>
                  {type.label}
                </Option>
              ))}
            </Select>
            
            <Search
              placeholder="搜索文档名称/项目/备注"
              allowClear
              style={{ width: 250 }}
              value={filters.keyword}
              onChange={(e) => setFilters({ ...filters, keyword: e.target.value })}
              onSearch={handleFilter}
            />
            
            <Button type="primary" icon={<SearchOutlined />} onClick={handleFilter}>
              查询
            </Button>
            
            <Button icon={<ReloadOutlined />} onClick={handleReset}>
              重置
            </Button>
            
            <Button type="primary" icon={<UploadOutlined />} onClick={handleUpload}>
              上传文档
            </Button>
          </Space>
        </div>
        
        {/* 文档列表 */}
        <Table
          columns={columns}
          dataSource={documents}
          rowKey="id"
          loading={loading}
          pagination={pagination}
          onChange={handleTableChange}
          scroll={{ x: 1200 }}
          locale={{
            emptyText: (
              <Empty
                description="暂无文档"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            )
          }}
        />
      </Card>
      
      {/* 上传弹窗 */}
      <Modal
        title="上传文档"
        open={uploadModalVisible}
        onCancel={() => {
          setUploadModalVisible(false);
          setFileList([]);
        }}
        footer={null}
        width={600}
        destroyOnClose
      >
        <UploadForm
          projects={projects}
          docTypes={docTypes}
          fileList={fileList}
          setFileList={setFileList}
          uploading={uploading}
          onSubmit={handleUploadSubmit}
          beforeUpload={beforeUpload}
          onCancel={() => {
            setUploadModalVisible(false);
            setFileList([]);
          }}
        />
      </Modal>
      
      {/* 详情弹窗 */}
      <Modal
        title="文档详情"
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setDetailModalVisible(false)}>
            关闭
          </Button>,
          <Button
            key="download"
            type="primary"
            icon={<DownloadOutlined />}
            onClick={() => {
              handleDownload(currentDoc);
            }}
          >
            下载
          </Button>
        ]}
        width={600}
      >
        {currentDoc && (
          <div>
            <p><strong>文档名称：</strong>{currentDoc.doc_name}</p>
            <p><strong>关联项目：</strong>{currentDoc.project_no} - {currentDoc.project_name}</p>
            <p>
              <strong>文档分类：</strong>
              <Tag color={docTypeMap[currentDoc.doc_type]?.color || 'default'}>
                {docTypeMap[currentDoc.doc_type]?.label || currentDoc.doc_type}
              </Tag>
            </p>
            <p><strong>文件大小：</strong>{currentDoc.file_size_formatted}</p>
            <p><strong>上传人：</strong>{currentDoc.uploader_name}</p>
            <p><strong>上传日期：</strong>{currentDoc.upload_date}</p>
            <p><strong>备注：</strong>{currentDoc.remark || '-'}</p>
          </div>
        )}
      </Modal>
    </div>
  );
};

// 上传表单组件
const UploadForm = ({ projects, docTypes, fileList, setFileList, uploading, onSubmit, beforeUpload, onCancel }) => {
  const [form, setForm] = useState({
    project_id: null,
    doc_type: 'other',
    remark: ''
  });
  
  const uploadProps = {
    multiple: true,
    fileList,
    beforeUpload: (file) => {
      if (beforeUpload(file)) {
        setFileList([...fileList, file]);
      }
      return false; // 阻止自动上传
    },
    onRemove: (file) => {
      const index = fileList.indexOf(file);
      const newFileList = fileList.slice();
      newFileList.splice(index, 1);
      setFileList(newFileList);
    }
  };
  
  const handleSubmit = () => {
    onSubmit(form);
  };
  
  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', marginBottom: 8 }}>
          <span style={{ color: 'red' }}>* </span>关联项目：
        </label>
        <Select
          placeholder="请选择关联项目"
          style={{ width: '100%' }}
          value={form.project_id}
          onChange={(value) => setForm({ ...form, project_id: value })}
          showSearch
          filterOption={(input, option) =>
            option.children.toLowerCase().indexOf(input.toLowerCase()) >= 0
          }
        >
          {projects.map(p => (
            <Option key={p.id} value={p.id}>
              {p.project_no} - {p.name}
            </Option>
          ))}
        </Select>
      </div>
      
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', marginBottom: 8 }}>文档分类：</label>
        <Select
          style={{ width: '100%' }}
          value={form.doc_type}
          onChange={(value) => setForm({ ...form, doc_type: value })}
        >
          {docTypes.map(type => (
            <Option key={type.value} value={type.value}>
              {type.label}
            </Option>
          ))}
        </Select>
      </div>
      
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', marginBottom: 8 }}>备注：</label>
        <Input.TextArea
          placeholder="请输入备注"
          rows={2}
          value={form.remark}
          onChange={(e) => setForm({ ...form, remark: e.target.value })}
        />
      </div>
      
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', marginBottom: 8 }}>
          <span style={{ color: 'red' }}>* </span>选择文件：
        </label>
        <Dragger {...uploadProps}>
          <p className="ant-upload-drag-icon">
            <UploadOutlined />
          </p>
          <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
          <p className="ant-upload-hint">
            支持多种格式：PDF、Word、Excel、图片、压缩包等，单个文件不超过 100MB
          </p>
        </Dragger>
      </div>
      
      <div style={{ textAlign: 'right' }}>
        <Space>
          <Button onClick={onCancel}>取消</Button>
          <Button type="primary" loading={uploading} onClick={handleSubmit}>
            确认上传
          </Button>
        </Space>
      </div>
    </div>
  );
};

export default DocArchive;
