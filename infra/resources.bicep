param location string
param aiAccountName string
param aiProjectName string
param searchServiceName string
param aiModelDeploymentName string
param aiModelVersion string
param embeddingModelDeploymentName string
param embeddingModelVersion string
param aiModelCapacity int
param embeddingModelCapacity int

var commonTags = {
  project: 'openai-acs-msgraph'
  purpose: 'talk-demo'
}

resource aiAccount 'Microsoft.CognitiveServices/accounts@2026-05-01' = {
  name: aiAccountName
  location: location
  kind: 'AIServices'
  sku: {
    name: 'S0'
  }
  identity: {
    type: 'SystemAssigned'
  }
  tags: commonTags
  properties: {
    allowProjectManagement: true
    apiProperties: {}
    customSubDomainName: aiAccountName
    publicNetworkAccess: 'Enabled'
  }
}

resource aiProject 'Microsoft.CognitiveServices/accounts/projects@2026-05-01' = {
  parent: aiAccount
  name: aiProjectName
  location: location
  #disable-next-line BCP187
  kind: 'AIServices'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    displayName: 'AI ACS Org Data'
    description: 'Foundry project for the OpenAI, ACS, Microsoft Graph, and Foundry IQ talk demo'
  }
  dependsOn: [
    embeddingModelDeployment
  ]
}

resource aiModelDeployment 'Microsoft.CognitiveServices/accounts/deployments@2026-05-01' = {
  parent: aiAccount
  name: aiModelDeploymentName
  sku: {
    name: 'GlobalStandard'
    capacity: aiModelCapacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: 'gpt-5-mini'
      version: aiModelVersion
    }
    raiPolicyName: 'Microsoft.DefaultV2'
    versionUpgradeOption: 'OnceNewDefaultVersionAvailable'
  }
}

resource embeddingModelDeployment 'Microsoft.CognitiveServices/accounts/deployments@2026-05-01' = {
  parent: aiAccount
  name: embeddingModelDeploymentName
  sku: {
    name: 'GlobalStandard'
    capacity: embeddingModelCapacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: 'text-embedding-3-small'
      version: embeddingModelVersion
    }
    raiPolicyName: 'Microsoft.DefaultV2'
    versionUpgradeOption: 'OnceNewDefaultVersionAvailable'
  }
  dependsOn: [
    aiModelDeployment
  ]
}

resource searchService 'Microsoft.Search/searchServices@2026-03-01-preview' = {
  name: searchServiceName
  location: location
  sku: {
    name: 'free'
  }
  tags: commonTags
  properties: {
    authOptions: {
      aadOrApiKey: {
        aadAuthFailureMode: 'http401WithBearerChallenge'
      }
    }
    disableLocalAuth: false
    hostingMode: 'Default'
    knowledgeRetrieval: 'free'
    partitionCount: 1
    publicNetworkAccess: 'Enabled'
    replicaCount: 1
    semanticSearch: 'free'
  }
}

output aiAccountName string = aiAccount.name
output aiProjectName string = aiProject.name
output aiEndpoint string = 'https://${aiAccount.name}.openai.azure.com/'
output searchServiceName string = searchService.name
output searchEndpoint string = 'https://${searchService.name}.search.windows.net'
